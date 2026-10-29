# Cloudflare Containers Executor — Fleet-Autonomy Implementation Spec

Canonical: QNFO/qnfo-ops/docs/CONTAINERS-EXECUTOR.md (2026-09-06)
Status: substrate verified LIVE; plan registered task_dod_register id 93/94/95 (owner=agent, due 2026-09-09/09-12) + fleet-cron-coverage-audit id 95 (scheduled-runner, due 2026-09-07).

## 1. Verified substrate (claim-sheet)

| Claim | Evidence | Confidence |
|---|---|---|
| Cloudflare Containers is enabled on the Quniverse account | GET /accounts/edb167b78c9fb901ea5bca3ce58ccc4b/containers/applications -> HTTP 200, success:true, 0 errors, result [] (live probe 2026-09-06) | High |
| Containers API surface exists (apps/instances/rollouts/versions/registries/image-preparations) | Cloudflare OpenAPI search: 14 container endpoints | High |
| Plain Workers cannot run a true Claude-Code agent (no shell/fs/git) | qnfo-ops run_code tool = "isolated compute: no network/filesystem/secrets/bindings" | High |
| User directive: 100% cloud/server-side, 100% autonomous/user-free, self-auditing feedback loops | Conversation 2026-09-06 + CLOUD-AUTONOMY-100-1 / USER-FREE-RESOLUTION-1 | High |

## 2. Why Containers closes the gap

- A Container is a real process (git/node/python/any runtime) started, routed, and shut down on Cloudflare's network.
- Wrangler config: [[containers]] class_name + image (./Dockerfile or registry), bound as a Durable Object; the DO can start/stop/talk to the container process.
- The durable OpsExecWorkflow (v2.1-v2.3) is the scheduler; the Container is the executor. Together they make a 100%-server-side, user-free code agent with a real filesystem/shell/git.

## 3. Target architecture (T1-T3)

T1 (registered id 93, due 2026-09-09): qnfo-code-executor container app
- Dockerfile: python3.12 + git + node22 + openssh-client + bash (batteries for repo work).
- Worker (DO) exposes /health and /exec: POST {repo, cmd} -> clone/pull QNFO/<repo> into /workspace, run cmd, return stdout/stderr/exit + git diff.
- Auth: Bearer CODE_AGENT_KEY (same pattern as qnfo-code-agent v0.1.0).
- Image push: Cloudflare Registry via wrangler deploy (or docker.io reference).

T2 (registered id 94, due 2026-09-12): wire into the ops_exec durable jobs
- qnfo-ops OpsExecWorkflow gains a container_executor tool that POSTs to the qnfo-code-executor DO (service binding) instead of the isolated run_code sandbox.
- workspace_write/read/list/delete (R2 virtual FS today) get a real-FS mode inside the container.
- github_repo_read/file_write/pr keep working from inside the container (real git clone/commit/push).

T3: self-auditing feedback
- fleet-cron-coverage-audit (id 95, scheduled-runner, due 2026-09-07): every open agent-owned register row must have a dated cloud cron or durable-job executor; kaizen 2026-09-07 report is the enforcement point.
- The existing telemetry_analyze / qnfo-kaizen digest / adversarial-guard / scheduler-guard already form the self-audit loop; the executor adds the "do real repo work" arm.

## 4. Cost model (official, 2026-09-06)

- CPU-time priced at $0.00002 per vCPU-second, now utilization-based (2026-02-25 changelog).
- Memory + disk billed on provisioned size.
- Worker requests + CPU-ms remain the base meters; a small executor pool (1-2 instances, ~0.5-1 vCPU) on-demand is the cost target: minutes of use per task, not always-on.

## 5. Acceptance gates

- [ ] T1: /exec clone+diff smoke test logged in cloud_ops_events; app id recorded.
- [ ] T2: job-workflow strategy=container-executor ok=1 with real FS write/read.
- [ ] T3: kaizen 2026-09-07 shows 0 agent-owned rows without an executor; v_waiting_on_human stays 0.
