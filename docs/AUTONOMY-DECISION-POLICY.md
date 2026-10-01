# AUTONOMY-DECISION-POLICY-1: a human is an override, never a dependency

**Source (owner directive, 2026-10-01):** "THE SYSTEM SHALL RESOLVE ALL ISSUES AND ALL BLOCKERS AUTOMATICALLY AND SHALL NEVER REQUIRE A USER
ON CRITICAL-PATH DECISIONS/ACTIONS/EXECUTION." This page is a session's reading of that directive: it is reversible, and the owner's
word overrides it. It exists so the next session does not have to guess where the lines are.

## The rule
Every decision point gets an **automatic safe default**. The system applies the default, records it, and moves on. A human can *override* a
default; nothing waits for one. "Needs the owner" is never a terminal state for work on the critical path (deploys, audits, the research
pipeline, serving traffic). It is a **parked** state with a default already in effect.

## Three tiers
| Tier | What | The system |
|---|---|---|
| **T1** reversible, bounded, inside existing limits | thresholds, dead-code retirement, redefining an infeasible DoD, merging a green PR, ordering a queue | **decides and executes**, and records why (PR text, `agent_issues` row, this doc) |
| **T2** irreversible, external-facing, or touches credentials/spend/exposure | rotating or overwriting a live credential, publishing as the owner, enabling an access gate that can lock people out, anything that bills | does **not** act. Keeps the current safe configuration serving, parks the item with the default stated, and **continues all other work** |
| **Never** (regardless of directive) | raising a spend cap; minting, rotating or overwriting a live credential; deleting data; disabling a security control or guard; routing around the canonical deploy path; sending third-party mail or posts as the owner | refused. If one of these is the *only* way forward the item parks (T2) |

## Why "never" includes credentials
A session cannot read a secret it did not mint, and issue #1701 recorded the failure mode of sessions rotating shared secrets on each other
(it caused the 2026-10-01 deploy 401). A system that auto-rotated on a 401 would turn a stale secret into an outage and an attacker's
401 into a privilege path. Detection is automatic (`ci-watchdog` class `deploy-unauthorized` files one deduped issue); correction is not.
This one was resolved by a peer session within the hour, and nothing on the critical path waited.

## Parked items and the default in effect (verified 2026-10-01)
| Item | Why it cannot be T1 | Default in effect (nothing waits) | What would change it |
|---|---|---|---|
| Cloudflare Access (#1277) | needs an Access-scoped credential; a wrong policy locks the owner out | admin routes stay bearer-protected; `scripts/access_probe.py` (PR #219) measures exposure | owner enables Access per `docs/CF-ACCESS-ROLLOUT-1277.md` |
| Publication of a curated article (#1163), Zenodo deposit (#1091) | publishes externally as the owner | stays a draft; `fleet-control` publication preflight reports the route state hourly | owner publishes, or supplies the deposit credential |
| `qnfo-code-agent` PR-write credential | a session cannot mint a GitHub App or PAT | `qnfo-code-orchestrator` parks tasks as `needs_human` (it never opens an unverified PR) | a credential is supplied |
| Spend caps (#1683, #1699) | raising a cap is **Never** | caps unchanged; the *measurement* is fixed, never the threshold | owner changes the cap |
| Local DeepChat guards (#1686) | they inspect the owner's machine | **T1 decided below** | n/a |

## Decision record: #1686 GUARDS-LOCAL-ONLY-1 (T1)
- **Literal DoD** ("a server-side runner executes all four guards") is infeasible for three of them. `prompt-store-verify`, `scheduler-guard` and
  `model_guard` read the owner's local DeepChat database and `%APPDATA%` (hard-coded `C:\Users\LENOVO\...`); a cloud runner has nothing to
  inspect, so a pass would be false assurance. `scheduler-guard`'s own header records the owner's 2026-09-08 directive that DeepChat is a
  *thin-client front end, never canonical or orchestrator*, so these guards protect a client, not the cloud system.
- **Done:** the fourth, `adversarial-guard`, has a repo-file half. It runs in CI as `scripts/adversarial-workers-guard.py` (core workers fail-closed;
  wider sweep advisory) and a failure is filed by `ci-watchdog` (PR #211).
- **Decision:** the DoD is amended to that. The three local guards stay local by design.
- **Residual risk, stated plainly:** nothing in the cloud notices if the local guards stop running. Reversible: if the owner wants a heartbeat,
  it is a small addition, not a redesign.

## What exists vs what is only policy
- Exists: `ci-watchdog` classes (`deploy-unauthorized`, recovered-push), the audit's confirm-before-report (`fleet-autoaudit.py` DRIFT-CONFIRM-1),
  `needs_human` parking in the code-task loop (PR #223), the publication preflight.
- **Not built:** a single "Parked (non-blocking)" section on the audit issue (#52) listing each parked item with its default. Today the table above is
  the only index, and it is hand-maintained.
