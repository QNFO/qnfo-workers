# qnfo-github-steward

GITHUB-STEWARD-1 — the loop that keeps the QNFO GitHub estate in its declared shape.

## Why

The estate was optimised once, by hand, and then drifted. Measured on 2026-10-17 before this
worker existed:

| Defect | Count |
|:--|:--|
| active repositories that did **not** delete a merged branch | 61 / 61 |
| active repositories with a protected default branch | 3 / 61 |
| repositories allowing merge + rebase + squash simultaneously | 60 / 61 |
| organisation default permission granted to every member | `admin` |
| org-wide `GITHUB_TOKEN` default | `write` |
| workflows that could approve pull requests | `true` |

A setting is an optimisation only if something restores it. This worker restores it every six
hours and records each run in D1 (`qnfo-audit.github_steward_runs`).

## What it does

Reads one org (`QNFO`) plus the owner's personal account, compares every non-archived repository
and the organisation to the declared state in `worker.js`, writes only the differences, verifies
nothing else changed, and appends a ledger row.

It **never** deletes a repository, **never** archives one, **never** pushes a commit, and
**never** rewrites workflow YAML. Workflow findings are reported, not repaired: a heuristic
rewrite of a build file turns a green pipeline red, and that repair belongs to the code-agent
with a diff a human can read.

## Declared state

```
org   : default_repository_permission=read, members_can_create_public_repositories=false
repo  : delete_branch_on_merge, allow_auto_merge, allow_update_branch, allow_squash_merge,
        allow_merge_commit=false, allow_rebase_merge=false, has_projects=false
branch: no force-push, no deletion, no required reviews (autonomous direct pushes stay legal)
```

## Routes

| Route | Auth | Purpose |
|:--|:--|:--|
| `GET /health` | none | version, declared state, token presence |
| `GET /report` | none | the most recent ledger row |
| `POST /tick` | `x-steward-key` | reconcile now (`?workflows=1` also audits workflow hygiene) |

Cron: `17 */6 * * *` — minute 17 keeps it clear of the fleet's ten-minute control tick.

## Verification (2026-10-17)

```
run 1  0.1.0  checked=61  fixed=61  drift=360  errors=0  limitations=12
run 2  0.1.1  checked=61  fixed=0   drift=0    errors=0  limitations=12
```

Run 2 converging to zero is the proof the loop is idempotent rather than reporting phantom work.
(`0.1.0` compared against the LIST endpoint, which omits `delete_branch_on_merge` and the merge
flags, so every repository read as drifted; `0.1.1` compares against the single-repository
endpoint.)

## TRACKER-SYNC-1 — D1 and GitHub in step every 10 minutes (0.3.0)

Owner directive 2026-10-18: `qnfo-audit.code_tasks` and GitHub issues/PRs stay in sync at all times, so no metric
counts a phantom. Cron `3,13,23,33,43,53 * * * *` (off the control tick).

| Pair | Authority | What the tick does |
|:--|:--|:--|
| `agent_issues` ↔ GitHub issues (label `fleet-issue`, title `[#id] …`) | D1 (close-evidence gate) | files every open issue (20/tick), closes the GitHub issue when D1 closes it (posting the close evidence), reopens a GitHub issue closed by hand while D1 is open |
| `code_tasks` ↔ pull requests | GitHub | marks a task `merged` when its PR merged; records every other disagreement and every `codeagent-*` PR without a task row as drift |
| `fleet_issue_dispatch` ↔ GitHub issues (ISSUE-SYNC-1) | — | moved from the 6-hourly reconcile onto this tick |

Links live in `gh_issue_links` and `code_task_pr_links` (not new `agent_issues` columns: `agent_issues_tombstone` copies
it with `SELECT *`). `v_tracker_drift` lists what is still out of step; metric `tracker_drift` (target 0, trigger at > 0)
is graded once the open-issue backfill has finished. Scope (owner choice): open issues only; closed history stays in D1.
Public repository: descriptions are fenced, tokens and e-mail addresses redacted, personal and security issues mirrored by number only.
A failed or partial GitHub read changes nothing, and more than half the links disagreeing at once is refused as an anomaly.

`GET /tracker` shows the last tick; `POST /tracker/tick` (`x-steward-key`) runs one now.

## Known limits — recorded, not hidden

* **12 limitations are permanent on this plan.** Branch protection and auto-merge require
  GitHub Pro for private repositories; the six private repositories cannot have either until
  the plan changes. The worker records them once per run instead of retrying.
* **`two_factor_requirement_enabled` cannot be set over the REST API** on this plan — `PATCH
  /orgs/QNFO` accepts the field and returns 200 without applying it. It needs the web UI.
  (The owner account itself has 2FA enabled; the org requirement is simply not enforceable.)
* **Token.** Repository settings need `administration: write`, which the `qnfo-fleet` GitHub App
  does not have and cannot be granted through the API. This worker therefore holds the fleet's
  personal token for administration work only; content and workflow operations elsewhere in the
  fleet use the App installation token (`github_app_token_ok=1` since 2026-10-17).


## Portfolio, programs, projects and roadmap (PORTFOLIO-SYNC-1, 0.4.0)

Runs on the same 10-minute tick, right after TRACKER-SYNC-1. D1 `qnfo-audit` is authoritative; GitHub is the mirror.

| D1 (source of truth) | GitHub (QNFO/qnfo-workers) | Rule |
|:--|:--|:--|
| `programs` | labels `program:research|infra|ops|reach|personal` | fixed map, created if missing |
| `projects` (`source='derived'`) | milestone `<project_code> · <name>` | one per live worker (`W.<worker>`, from `service_registry`) and per active public non-fork repo (`R.<repo>`, from `portfolio_repos`); retired with its source, milestone closed |
| `issue_project_map` | issue milestone + `kind:fix|enhancement|research|owner` | every open mirrored `agent_issues` row is placed by triage owner, then source |
| `roadmap_implementation` | issues labelled `roadmap`, `[RM-<id>]` | open items mirrored; closed with evidence when D1 verifies; a hand close is reopened |
| `v_metric_trigger_state` hit=1 | roadmap objective `RM-METRIC-<metric>` | opened on breach, verified with the measured value when it clears |
| (all of the above) | org Projects v2 board "QNFO Fleet Portfolio" | best effort; failure is a recorded limitation |

Graded by `v_portfolio_drift` -> metric `portfolio_drift` (target 0, trigger -> agent_issues).
Routes: `GET /roadmap` (public tree; personal projects counted, never itemised), `GET /portfolio` (last tick),
`POST /portfolio/tick` (x-steward-key). Safety: per-tick caps, a degenerate census (<10 rows) never retires a project,
a failed or anomalous GitHub list changes nothing, legacy hand-written projects are never auto-retired.
