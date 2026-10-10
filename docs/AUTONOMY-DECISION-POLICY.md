# AUTONOMY-DECISION-POLICY-1: a human is an override, never a dependency

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

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
| **T1** reversible, bounded, inside existing limits | thresholds, dead-code retirement, redefining an infeasible DoD, merging a green PR, ordering a queue; **owner-voice publishing inside the gates below (gated T1)**; **under the owner's standing grant (2026-10-05)**: retiring an idle or low-value worker after a dependency check, deleting an unused database after a verified backup, switching to a cheaper model with a per-request fallback and an automatic revert; **since RULE-8-RETIRED-1 (2026-10-06)**: setting or raising its own spend caps, adding a worker, cron or model call while a cap is breached, changing or retiring a guard metric or probe when the evidence says it measures the wrong thing, deleting data (backup first by default) | **decides and executes**, and records why (PR text, `agent_issues` row, this doc) |
| **T2** irreversible, external-facing (other than gated owner-voice publishing), or touches credentials/exposure | rotating or overwriting a live credential, enabling an access gate that can lock people out, paying a new vendor | does **not** act. Keeps the current safe configuration serving, parks the item with the default stated, and **continues all other work** |
| **Never** (regardless of directive) | minting, rotating or overwriting a live credential; disabling a security control; routing around the canonical deploy path; mailing an address that opted out or sending outreach outside its consent gate and cadence caps; moving personal-plane data into the research plane or onto a public surface | refused. If one of these is the *only* way forward the item parks (T2) |

Changed 2026-10-01 (STRATEGY-1): "publishing as the owner" left T2 and "sending third-party mail or posts as the owner" left
Never. Owner directive 2026-10-01 authorises the system to publish and send as the owner, so owner-voice publishing is
gated T1 (next section). Every other Never item is unchanged.

Changed 2026-10-05 (OWNER-STANDING-GRANT-1, charter decision rule 9): the owner granted "bold autonomous systems that think
and act entirely on their own". Retiring idle or low-value workers, deleting unused databases after a verified backup and
switching to cheaper models are T1 under the conditions in charter rule 9, with no owner card. "Deleting data" in Never
now reads "deleting data that has no verified backup"; raising a cap and adding paid model calls while a cap is breached
stay refused.

Changed 2026-10-06 (RULE-8-RETIRED-1, charter decision rule 10): the owner directed "'Rule 8' is now deleted entirely. The
system needs more flexibility and more autonomy to decide for itself and make it's own choices ad hoc." Raising a spend cap,
adding paid model calls while a cap is breached, changing a guard or probe and deleting data moved from Never to T1: the
system decides, records the reason and the live measurement, and follows core rule 7 for any self-change. "Anything that
bills" left T2 (a breached cap already only steers model choice, BUDGET-SOFT-ROUTE-1). Mailing an opted-out address,
outreach outside its consent gate and cadence caps, and moving personal data into the research plane or onto a public
surface joined Never: they were rule 8's protections for people outside the fleet, which the owner's directive does not
reach, and the law requires most of them.

Changed 2026-10-08 (AUTONOMY-FIRST-1, charter decision rule 11): the owner directed "Implement autonomy-first protocol
system/fleet-wide and in all Claude operations". The owner is interrupted only for a step that is both irreversible and
identity-bound: a credential only the owner can mint, money, a legal or signing act, the owner's own accounts, machine
or personal data, or posting on a channel whose terms forbid automation (LinkedIn below). Every other decision is T1,
merge approvals and tuning included; T2 now holds only the identity-bound credential and access-gate items, each parked
with its default in effect. The Never list is unchanged. A machine gate enforces it: `v_human_action_gate`
(migrations/2026-10-08-autonomy-first.sql) reroutes a new owner card that is not identity-bound into an
`AUTONOMY-FIRST-REROUTE-1` issue. Measured at authoring against all 63 cards ever written, 18 historical cards had
asked the owner for a fleet decision (merge PR 574, 726, 762 and 763, the q08 cap, the remedy window, control-plane
scope, a bulk edit of 417 records, ...); of the 7 then open, one (#63, an ASK-TUNE-1 search-space choice) was rerouted.

### Autonomy-first audit (AUTONOMY-FIRST-AUDIT-1, 2026-10-08)
| Failure mode | Measured 2026-10-08 | Root cause | Remedy (all automatic from the merge) |
|---|---|---|---|
| owner card for a fleet decision | 1 open (#63), 18 of 63 ever | loops (qnfo-ai-search ASK-TUNE-1/ASK-FIX-1) and sessions escalated stalls and merges to the owner | `v_human_action_gate` + trigger reroute; metric `owner_queue_fleet_cards_open`, target 0 |
| issue waits on a Claude session | 28 of 130 open, unmeasured | the code loop refuses control-plane workers, `scripts/`, several files and huge files, and the refusal becomes a `session-task:` line | metric `session_dependent_issues_open` with a trigger whose lever closes the largest scope gap first (#2074, #2101 open) |
| a session redoes loop work | `code_task_superseded_share_30d` 0.29 vs 0.10, no trigger | sessions start the same change while a loop task holds it | trigger on the metric, lever on CLAIMS-FIRST-1 and the work-lock refusal |
| code loop output lost | `code_task_success_rate_30d` 0.24 | goal-review rejections, control-plane refusals, retries after failing suites | already filed (open METRIC-TRIGGER issue); not duplicated |
| recurring step needs a person | `watchmaker_index` 1 | one operation still needs a person or session | already filed (open METRIC-TRIGGER issue); not duplicated |
| "still computing mergeability" closures | 3 in 7 days | a mislabelled wait note, fixed in qnfo-fleet-control (see its comment at the merge runner) | none needed |

The audit repeats itself: `v_autonomy_first_audit` is refreshed on every hourly `open_agent_issues` write, and each
breach files one deduped METRIC-TRIGGER issue with its lever. No session or claude.ai schedule is involved.

## Owner-voice publishing (gated T1)
Source: docs/STRATEGY.md section 5, which is authoritative; this is a summary. The system decides and executes inside these
gates and records each act.
- **Platform rule first:** LinkedIn's API Terms (3.1) forbid automated posting, so LinkedIn posts are drafted automatically
  and published only after the owner's one-tap approval in Buffer. Bluesky, Mastodon and Threads allow automatic posting.
- **Automatic (inside the gates):** posts that summarise or announce the owner's own published works (selected works first);
  the scheduled cadence in STRATEGY.md section 4; first-contact research emails and one follow-up under the consent rules;
  the subscriber digest / research note.
- **Never automatic (draft only, or not at all):** replies, comments or DMs to individuals on social platforms; anything that
  names a third party (person or company) critically, or makes a claim not present in the source work; topics outside the
  four pillars (politics, news commentary); follows, likes or reposts at scale; paid promotion, raising any spend cap,
  credentials, deleting data that has no verified backup (the unchanged Never items).
- **Gates every owner-voice item passes:** (1) fact check against the source title and abstract; (2) identity lexicon
  (STRATEGY.md section 2.1 names only, no banned labels); (3) encoding check, no mojibake sequences; (4) link liveness and a
  UTM tag on every link; (5) cadence caps per channel and a duplicate check against the last 30 days; (6) one kill switch
  per stream (`pipeline_state.external_sends_enabled` for email, `Q08_SOCIAL_QUEUE` for q08, a social pause flag to add in
  qnfo-social); (7) a daily "sent as you" digest to the owner's alerts channel listing every item, with the one-line stop
  command.
- **Cold email consent rules (OUTREACH-CONSENT-1):** a real reason tied to the recipient's own work; an opt-out line in
  every message; suppression list honoured by both engines; one honest follow-up (`Following up:`, never a fake `Re:`); at
  most 8/day in total and 3/day per domain; no repeat contact after an opt-out, bounce or reply.

## Why "never" includes credentials
A session cannot read a secret it did not mint, and issue #1701 recorded the failure mode of sessions rotating shared secrets on each other
(it caused the 2026-10-01 deploy 401). A system that auto-rotated on a 401 would turn a stale secret into an outage and an attacker's
401 into a privilege path. Detection is automatic (`ci-watchdog` class `deploy-unauthorized` files one deduped issue); correction is not.
This one was resolved by a peer session within the hour, and nothing on the critical path waited.

## Parked items and the default in effect (verified 2026-10-01)
| Item | Why it cannot be T1 | Default in effect (nothing waits) | What would change it |
|---|---|---|---|
| Cloudflare Access (#1277) | needs an Access-scoped credential; a wrong policy locks the owner out | admin routes stay bearer-protected; `scripts/access_probe.py` (PR #219) measures exposure | owner enables Access per `docs/CF-ACCESS-ROLLOUT-1277.md` |
| Publication of a curated article (#1163), external deposit (#1091; the external DOI deposit path was retired 2026-10-10) | the parked reason ("publishes externally as the owner") no longer holds: publication as the owner is gated T1 since 2026-10-01 (STRATEGY.md section 5) | stays a draft; `fleet-control` publication preflight reports the route state hourly | the system publishes once the item passes the owner-voice gates (or the owner publishes); the deposit still needs the deposit credential |
| `qnfo-code-agent` PR-write credential | a session cannot mint a GitHub App or PAT | `qnfo-code-orchestrator` parks tasks as `needs_human` (it never opens an unverified PR) | a credential is supplied |
| Spend caps (#1683, #1699) | no longer parked: caps are the fleet's to set since RULE-8-RETIRED-1 (charter rule 10) and steer model choice only (BUDGET-SOFT-ROUTE-1) | a breached cap routes work to the cheapest capable model | n/a (T1) |
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
