# Closeout, 2026-10-01: no Claude dependency at runtime

Companion to `docs/CLOSEOUT-2026-10-01.md` and `docs/CLOSEOUT-2026-10-01-ROUND2.md` (parallel sessions). Pillars: autonomy,
personal, security.

Owner directive: the fleet and its dashboard must not depend on continued Claude usage, and all data, dashboards and UI are
hosted on Cloudflare, never on claude.ai. CLAUDE.md records it as NO-CLAUDE-RUNTIME-DEPENDENCY-1 and
CLOUD-ONLY-VERIFICATION-1.

## Merged

| PR | What it moved onto Cloudflare |
|---|---|
| #335 | CLOUDFLARE-ONLY-HOST-1. The identity review and Identity-doc editing run on Cloudflare (cloud-ops 1.16.0, fleet-dashboard 1.11.1). `cloudflare-only-host-guard.py` fails CI on a claude.ai link in any tracked file. |
| #343 | IDENTITY-STORE-1. Owner documents live in the private D1 `qnfo-identity`, bound only to qnfo-fleet-dashboard. The identity review moves with them (fleet-dashboard 1.12.0, cloud-ops 1.16.3). |
| #350 | Hardening for that move: redo-safe and copy-only, later `qnfo-audit.owner_docs` writes are synced, and owner links refuse claude.ai (1.12.1). |
| #352 | OBJECTIVE-REVISION-APPLY-1 and OWNER-NOTES-ROUTE-1: owner decisions are applied on Cloudflare. No Anthropic upstream anywhere: in qnfo-ops 2.38.34 a `claude-*` model id routes to the ops model. Session-as-operator paths are retired (1.13.1). |
| #357 | WATCHMAKER-INDEX-1: a daily count of recurring operations that still need a person or a session (`GET /api/watchmaker`, metric `watchmaker_index`, target 0) (1.14.0). |
| #371 | TASK-INTENT-INTAKE-1: task intents from ChatBox, DeepChat and the dashboard become `agent_issues`. D1 triggers refuse `human_actions` cards that route work to Claude or link claude.ai or anthropic.com (1.14.1, `migrations/2026-10-01-human-actions-no-claude.sql`). |
| #382 | README: `qnfo-audit.owner_docs` is empty after the owner-approved removal. |
| #396 | PR-OUTCOME-RECONCILE-1: code-task-publish records `merged` or `closed` for a code task's PR, so merged PRs stop counting as waiting on a person. Verified: run 375 (21:37:54Z) moved the rows for #297, #368 and #381 to `merged`. |

## Data moved or retired (live, 2026-10-01 ~21:40Z)

- **The claude.ai Identity doc.** Its final export (rev 46 and its five comment threads) is in `personal-life.owner_documents`,
  key `identity-brand-opportunities`. The doc itself was deleted.
- **Owner documents.** They live in `qnfo-identity.owner_docs`. `qnfo-audit.owner_docs` has 0 rows; it was verified by hash
  before the owner-approved removal.
- **claude.ai Routines.** All 82 Routines on the account were exported, then deleted, and `list_triggers` now returns 0 rows.
  - They are recorded in `qnfo-audit.retired_claude_routines`: 82 rows, `deleted_at` set, 65,486 prompt characters.
  - The two identity prompts are not stored in qnfo-audit. They are in `personal-life.owner_documents`, keys `routine-<id>`
    (sha256 recorded), and `prompt_location` points to them.
  - The 4 recurring Routines and their Cloudflare replacements:

    | Routine | Replaced by |
    |---|---|
    | QNFO portfolio management | `portfolio-daily` (last run 2026-10-01 12:15Z) |
    | Identity and brand weekly review, Weekly identity and opportunity check | `identity-weekly` (first run Monday 2026-10-05 07:00Z) |
    | Daily fleet issue sweep | `fleet-defects` and backlog-drain |

  - The other 78 were one-shot reminders and check-ins, already fired or disabled. Their work is covered by
    `time-gated-verification`, meaning remediation_contracts run hourly by qnfo-fleet-control.
- **ops_config.** `external_agent_recurring_tasks=0` and `claude_routines_deleted_by_owner=1`.

## The owner's four remediation asks

| Ask | Outcome |
|---|---|
| Set `OWNER_TOKEN` on the dashboard | Superseded. The owner later directed open access ("I don't want an owner token ... favor free, open access"). A parallel session shipped that as OPEN-ACCESS-1 (fleet-dashboard 1.15.x). `GET /api/human` answers 200 with no token on 1.15.1-queue-delegated. |
| Merge or close code-task PRs #297 and #368 | Both were already merged, #297 at 10:40Z and #368 at 21:04Z, and #381 is merged too. The real defect was that `code_tasks` never recorded the outcome. #396 fixes it, and all three rows now read `merged`. |
| Decide the pending objective revisions | Decided at 21:06Z through the dashboard's owner route. **Adopted and applied:** goal 58 (w_autonomy 0.20 to 0.15, w_self_improv 0.15 to 0.20, objective function v3). **Ratified and filed as work:** goals 41, 43 and 57 (agent_issues 1744, 1745, 1746), because they are not weight changes. **Rejected:** goals 42, 44 and 56. Issue 1725 is closed with this evidence. |
| Delete the disabled Routines after the 5 October identity review | Deleted on 1 October instead. See the next paragraph. |

Why the Routines were deleted now and not after 5 October:
- Waiting would need a claude.ai reminder to come back on 5 October, and the directive forbids that.
- No Cloudflare worker can call the claude.ai Routines API.
- Every prompt is preserved in D1.
- The 5 October check moved to Cloudflare. The issue 1724 contract requires a `portfolio_runs` row with kind
  `identity-weekly` and a portfolio-daily run in the last 2 days. The remediation consumer closes 1724 when both exist.
  The watchmaker `identity-weekly` op counts the loop as stalled if the first run never comes.

## Self-closing on evidence (no session needed)

| Issue | Closes when |
|---|---|
| 1724 ROUTINES-ON-CLAUDE-1 | The first identity-weekly run is recorded and portfolio-daily is fresh. Today the probe reads 0 for one reason only: the identity-weekly row is missing. |
| 1726 CODE-LOOP-ON-CLAUDE-1 | `watchmaker_index` = 0. The 2026-10-01 run counted 2: `task-intent-intake` and `code-task-merge`. `task-intent-intake` now has 0 pending task intents (#371). `code-task-merge` measured 0 at 21:40Z, after #396. The next daily run is at 07:00Z on 2 October. |
| 1744, 1745, 1746 | Each needs a machine probe once the ratified revision is reflected in what the fleet enforces. They are ordinary backlog items, not owner decisions. |

Roadmap: `roadmap_implementation` RM-NO-CLAUDE-RUNTIME-1 (id 125), status `partial`. It becomes `built` when 1724 and 1726
close.

## What a session still does

A session builds the fleet and follows its own open PR through GitHub events. It arms no claude.ai reminder, check-in or
Routine, and it is not a system of record. A decision the owner must make goes to https://fleet.qnfo.org.
