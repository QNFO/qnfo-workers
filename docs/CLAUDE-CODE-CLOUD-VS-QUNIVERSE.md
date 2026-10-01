# Claude Code cloud execution vs the Quniverse (2026-10-01)

Goal: make the Cloudflare Quniverse behave like a server-side, device-independent, model-independent,
cost-optimised autonomous system, the way a Claude Code cloud session does. This page compares the two
and names the gaps. Evidence labels: **[observed]** = seen first-hand in a cloud session on 2026-10-01;
**[repo]** = a file or workflow in this repository; **[inferred]** = my reading, not verified.
Nothing here describes Anthropic internals beyond what a session can see.

## 1. What a Claude Code cloud session is [observed]

| Property | Observed behaviour |
|---|---|
| Compute | An isolated, ephemeral container. The repo is cloned fresh at start; the container is reclaimed after inactivity, so unpushed work is lost. |
| State | Nothing durable lives in the container. Durable state is the git remote, GitHub issues/PRs, and connectors (here Cloudflare D1, GitHub). |
| Network | All egress goes through a policy-controlled proxy; a denied host is a policy decision, not a bug. |
| Tools | Tool access is mediated: GitHub through an MCP server, Cloudflare through a connector, shell inside the sandbox. A denied tool call is a user decision. |
| Continuation | Three independent mechanisms keep work going without a human: **Stop hooks** (block a stop, re-prompt), **event wake-ups** (a subscribed PR delivers CI/review events as new turns), and **scheduled self-messages / routines** (resume a session at a time). |
| Model | Configured per session; the serving model can change mid-session (fallback), so no logic may depend on which model answered. |
| Parallelism | Sub-agents and sibling sessions can be spawned; their results come back as notifications. |
| Autonomy limits | A permission mode gates actions; outward or hard-to-reverse actions are confirmed unless durably authorised. |

The essential property: **the session is disposable; the state and the triggers are not.**

## 2. How the Quniverse already maps [repo]

| Cloud-session property | Quniverse equivalent | Evidence |
|---|---|---|
| Durable state outside the compute | D1 `qnfo-audit` (agent_issues, worker_live_audit, task_dod_register), R2, KV | `docs/FLEET-NODE-MAP.md` |
| Scheduled resume | Cloudflare cron on 28+ workers (50 schedules) | `docs/FLEET-NODE-MAP.md` |
| Event wake-up | `workflow_run` chains: autoaudit/autodeploy, ci-watchdog, remediation-bridge/consumer. GitHub `schedule` is documented as **never firing** on this repo, so everything is event-driven | `.github/workflows/fleet-autodeploy.yml` header, `ci-watchdog.yml` |
| Model independence | AI Gateway plus a capability-gated model ladder; verifier-driven escalation | `docs/COST-OPTIMIZED-MODEL-CALLS.md` |
| Cost optimisation | L0 deterministic, L1 cache, L2 capability gate, L3 cascade, L4 ensemble only when free | same doc |
| Device independence | Server-side deploy route `/ops/deploy`, ops gateway, tools MCP; deploys never need a laptop | `qnfo-ops` (`/ops/deploy`), `ops-gateway`, `qnfo-tools-mcp` |
| Self-audit | `fleet-autoaudit.py` writes one `worker_live_audit` row per worker, publishes `audits/` and issue #52 | `scripts/fleet-autoaudit.py` |
| Self-update | Repo-ahead workers auto-deploy through the canonical path | `fleet-autodeploy.yml` `--apply` |
| Self-healing of CI | ci-watchdog files and resolves issues for failing workflows | `scripts/ci_watchdog.py` |

## 3. Gaps, ranked

1. **Continuation is session-side, not fleet-side.** The Stop hook (`.claude/hooks/drain-reprompt.py`) only
   re-prompts an interactive session. The server-side counterpart is the unattended drain routine logged in
   issue #174; its cadence and trigger are not defined in this repository **[inferred: it runs as a Claude
   routine]**. A fleet that "always knows its own state" needs that trigger to be a Cloudflare cron or a
   workflow_run chain, not a human-started session.
2. **The audit can lag main.** Before PR #207, `workflow_run` audits checked out a stale SHA and reported false
   DRIFT three times in one hour. Fixed; **not yet confirmed** by a post-fix audit.
3. **Deploy queue starvation risk.** `fleet-autodeploy` runs with one pending slot, so a burst of status
   commits replaces queued runs (most of the last 20 runs ended "cancelled"). In-progress deploys do finish, but the
   audit can trail main by minutes. Measure before changing.
4. **Some guards cannot move to the cloud.** `prompt-store-verify`, `scheduler-guard` and `model_guard` inspect
   the owner's local DeepChat database and `%APPDATA%`. Issue #1686's definition of done ("server-side runner
   executes all four") is therefore unachievable as written; only the repo-file half of `adversarial-guard`
   moved (`scripts/adversarial-workers-guard.py`). The DoD needs an owner decision.
5. **State of the fleet is spread over D1, GitHub and `audits/`.** PR #208 adds a unified open-work count in
   qnfo-ops; until it lands there is no single "own state" read.

## 4. Principles to keep

- A session may die at any time: commit and push, or the work does not exist.
- Prefer events to polling: a wake-up beats a loop.
- A guard must inspect what it claims to guard. A pass on a file that is not there is false assurance.
- Never let correctness depend on which model answered.
- Report a failure as a failure: an unverified fix is "unverified", not "fixed".
