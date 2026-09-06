# qnfo-code-orchestrator v0.1.0 — SPEC (autonomous self-verifying cloud code agent)

STATUS: SPEC-ONLY (unbuilt) - 2026-09-06 closeout
AUTHOR: ops session closeout (OPS-AGENT-1 continuation)
PREREQUISITE WORK (LIVE, verified 2026-09-06):
  - qnfo-containers-pilot v0.1.0 (Cloudflare Containers, python:3.12-slim via ctx.container.exec()) - LIVE
  - qnfo-code-agent v0.1.0 (GitHub tree/read/edit/list tool server; repoEdit = branch->PUT->optional PR) - LIVE
  - GITHUB_TOKEN secret (classic PAT, rwnq8) wired - read+write verified (self-cleaning 201/200/204)
GAP: neither worker has an LLM agent loop; nothing calls them; code-agent advertises MODEL kimi-k2.7-code
but contains NO AI binding. The autonomous AGENT (decide->edit->verify->iterate) is unbuilt.

## 1. What this worker does
Durable-Workflow-orchestrated LLM loop. Task in (HTTP POST, fail-closed auth) -> plan by reading the
target repo -> implement via code-agent repoEdit on a codeagent-* branch -> verify by running the
changed code/tests server-side via containers-pilot /exec -> on failure, feed the verify output back to
the model and iterate (bounded) -> on pass, repoEdit with create_pr=true -> return the PR URL.

## 1.1 Loop steps (Lamport: WHAT + WHY + SCOPE)
1. INGEST task {repo, goal, files?}. WHY: task is the sole input contract. SCOPE: QNFO org repos only.
2. PLAN: read tree + relevant files via code-agent /v1/repo/tree + /v1/repo/read. WHY: ground edits in
   the current tree, never from memory. SCOPE: bounded file budget (<=12k chars/read).
3. IMPLEMENT: one repoEdit per logical change, branch codeagent-<ts>. WHY: code-agent enforces
   branch-only (never main); PR is the review+CI surface. SCOPE: create_pr=false during iteration.
4. VERIFY: containers-pilot /exec runs python -c against the changed files. WHY: server-side execution
   is the only honest "it works" gate (COMPUTATIONAL-VERIFICATION-1). SCOPE: code must be python or
   container-exec-able.
5. ITERATE (bounded, default 3): model sees {verify_exit, stdout, stderr}, revises, re-edit, re-verify.
   WHY: self-correction loop. SCOPE: abort on budget with a clear failure report.
6. PUBLISH: final repoEdit create_pr=true. WHY: human/CI gate on the branch. SCOPE: never direct main.

## 2. MODEL PARITY DECISION (the deferred model-parity item, resolved here)
Do NOT default the orchestrator's planning/verdict LLM to kimi-k2.7-code (Workers-AI code model - fine
for tool-call/cheap rounds, weak for repo-wide reasoning). Route the PLAN / VERDICT / FAILURE-REVISE
rounds through the STRONG model already available to qnfo-ops: DeepSeek via the AI Gateway (parity with
ops-exec, api.deepseek.com upstream, zero markup). Use kimi-k2.7-code only for cheap tool-selection /
first-draft rounds. Model parity = frontier reasoning on the critical rounds, cheap model on the bulk.

## 3. Secret / ownership blocker (why this is NOT built yet)
The orchestrator must authenticate to code-agent (Bearer CODE_AGENT_KEY) and containers-pilot (Bearer
PILOT_TOKEN). Those secrets were generated + set by the session that built the two workers and are
write-only (not in this env - only GITHUB_TOKEN present). Build owner = the session that holds them (or
regenerate fresh orchestrator-scoped secrets). Do NOT redeploy the two workers with new secrets (clobber).

## 4. Deploy + verify plan (next cycle)
  wrangler.toml: [[workflows]] qnfo-code-orchestrator; AI Gateway binding for DeepSeek; secrets
  CODE_AGENT_KEY + PILOT_TOKEN + GITHUB_TOKEN.
  Verify: /health ok + one end-to-end task that reads a repo, edits a trivial scratch file on a branch,
  verifies via containers-pilot python, and opens a PR - then close the PR and delete the branch.

## 5. Open decisions for build owner
  - orchestrator as new worker vs. durable Workflow inside qnfo-ops (both viable; qnfo-ops already owns
    the agent loop + DeepSeek routing + GITHUB_TOKEN, so extending qnfo-ops may be lower-friction).
  - task intake auth (ops key parity vs. dedicated CODE_ORCH_KEY).
