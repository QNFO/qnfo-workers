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

## 5. Implementation status on Cloudflare (added 2026-10-01; evidence: autoaudit, live `/health`, repo)

**Not fully implemented.** Sections 1-4 describe a comparison and a gap list, not a finished system. Status by component:

| Component | State | Evidence |
|---|---|---|
| Durable state outside compute (D1/R2/KV) | **Live** | `docs/FLEET-NODE-MAP.md`; `qnfo-audit` D1 |
| Scheduled resume (cron) | **Live** | 50 schedules; `scripts/cron_rate_guard.py` enforces the 10-minute floor |
| Event wake-up (workflow_run chains, ci-watchdog) | **Live** | `fleet-autodeploy.yml`, `ci-watchdog.yml` |
| Auto-deploy of repo-ahead workers | **Live but BLOCKED** | the canonical route returns 401 (`OPS_ROUTER_AUTH_KEY`, issue 212): no worker can deploy until the secret is fixed |
| **Cloudflare Containers** | **Partial.** Live: `qnfo-containers-pilot` (shell, python, node22, git; `public_exec:false`, token-gated). Self-audit verdict AMBER: end-to-end exec not verifiable without the pilot token. `qnfo-code-orchestrator`'s `PyContainer` is **not deployed**. | autoaudit: pilot `SYNC 1.0.8`, orchestrator `NOT_DEPLOYED`; `ci-status/container-config-selfheal-cron.json` |
| **Dynamic Workers** | **Partial.** Live only as a sandboxed `run_code` tool in `qnfo-ai` and `qnfo-ops` (`[[worker_loaders]]`, `globalOutbound:null`). Not used for per-task workers, verification, or Dynamic Workflows. | `qnfo-ai/worker.js` `env.LOADER.load`; `qnfo-ai`, `qnfo-ops` wrangler.toml |
| Autonomous **research** agent (durable, alarm-driven) | **Live** | `qnfo-agent-orchestrator` `SYNC 1.1.0`, Durable Object `AgentTask` |
| Autonomous **code** agent loop (the "Claude Code in Cloudflare" core) | **Built in the repo, NOT deployed, NOT run against live Cloudflare.** `qnfo-code-orchestrator` v0.2.0 adds a durable task loop (D1 state, model ladder, container + Dynamic Workers verifiers, PR-gated, cron-driven). `qnfo-code-agent` (its GitHub tool server) is `NOT_DEPLOYED`. | `qnfo-code-orchestrator/README.md` Status; 35-assertion offline test `qnfo-code-orchestrator/test-loop.mjs`, run in CI as `code-loop-test` |
| Event-driven wake of a code task (CI/review webhook) | **Not built** | no webhook route; tasks resume only on the cron tick |
| Verifier that RUNS tests, multi-file edits | **Not built** | one file per task; verifiers are syntax/parse/size only |
| Server-side continuation of the drain routine (#174) | **Not built** | still session-driven |

### What was measured about Dynamic Workers (real `workerd`, wrangler 4.145)
- A JS **syntax error** fails the start as `Uncaught SyntaxError ... at m.js:L:C`, even when the module has unresolvable imports (parsing precedes linking): a reliable, execution-free-until-linked syntax signal.
- Valid syntax with a missing import fails later (`No such module`); `cloudflare:workers` imports resolve.
- `globalOutbound: null` blocks `fetch()` ("not permitted to access the internet").
- **Local `workerd` did not enforce `limits.cpuMs`**: a top-level `while(true){}` hung. Whether the real platform enforces it is **unmeasured**, which is why the loop's JS verifier ships off (`JS_VERIFY=off`) behind a probe route (`POST /v1/probe/dynamic-cpu`).

### What full implementation still requires (in order)
1. Fix the `OPS_ROUTER_AUTH_KEY` secret (owner) so anything can deploy.
2. Deploy `qnfo-code-agent` and `qnfo-code-orchestrator` through the canonical path, supply `ORCH_TOKEN`/`CODE_AGENT_KEY`, then run one real task end to end and record the result. Until then every claim about the loop is "passes offline", not "works".
3. Run the CPU-limit probe on the real platform; only then consider `JS_VERIFY=dynamic`.
4. Add a GitHub webhook wake-up and a test-running verifier (the Container's shell/git-clone is the natural place).
5. Point the drain routine (#174) at a cron or `workflow_run` trigger instead of a human-started session.
