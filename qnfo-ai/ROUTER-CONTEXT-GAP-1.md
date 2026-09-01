# ROUTER-CONTEXT-GAP-1 — QNFO-internal feature gloss for qnfo-ai DEFAULT_SYSTEM_PROMPT

**Status:** PREPARED 2026-09-01 (gate ENSEMBLE-AUTO-EXPRESS-LIVE-1 / ROUTER-CONTEXT-GAP-1). Deploy deferred to the qnfo-ai worker owner session (live moved to 5.6.5 with 22 bindings + internal service bindings; repo working tree has owner uncommitted changes — GIT-OWNERSHIP-1). Apply per the steps below once owner coordination is clear.

**Problem (canonical probe 2026-08-31):** qwen3-30b answered "Probe: does auto-express block the response on an opening turn" as a literature term ("no primary sources support this claim") because the DEFAULT_SYSTEM_PROMPT lacks QNFO-internal feature context.

## Patch (append to DEFAULT_SYSTEM_PROMPT in the LIVE bundle, bump VERSION 5.6.5 -> 5.6.6)

Append this block to the existing DEFAULT_SYSTEM_PROMPT string (before the closing quote):

QNFO-internal features you serve (answer probes from the internal state, never "not in literature"):
- Edge idea-intake pipeline: ChatBox/Android -> qnfo-ai -> multi-model ensemble -> glm-5.2 intent classifier -> auto-express harvests to qnfo-intent-orchestrator. auto-express is non-blocking: it harvests intent in parallel and does NOT block the answer. 'ensemble' is selectable from /v1/models (explicit selection always ensembles; auto-ensemble applies only to non-code, non-vision, non-tools requests with medium uncertainty or high complexity).
- INTENT_TOKEN: the qnfo-intent-orchestrator accepts this bearer token; after rotation, verify the orchestrator ACCEPTS the rotated token via a live probe before relying on intent harvest.
- Model roster (2026-08-31): glm-5.2 (intent classifier), glm-4.7-flash, qwen3-30b, deepseek-v4-flash, ensemble (multi-model).

## Deploy steps (agent-executable; run ONLY after owner coordination)

1. Fetch the LIVE bundle: GET /accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts/qnfo-ai/content (or workers_get_worker_code).
2. Edit: append gloss to DEFAULT_SYSTEM_PROMPT; bump VERSION = "5.6.6".
3. Deploy via API PUT with metadata that re-asserts ALL 22 live bindings (BINDING-PRESERVATION-1):
   AI(ai) CF_API_TOKEN(secret) CLOUD_OPS_VZ(vectorize qnfo-cloud-ops) DEEPSEEK_API_KEY(secret) EMAIL(service qnfo-email) EMAIL_API_KEY(secret) HANDOFFS_VZ(qnfo-handoffs) INFRA_TOKEN(secret) INFRA_VZ(qnfo-infra) INTENT_TOKEN(secret) IPATENT_VZ(ipatent-corpus) LOG_VZ(qnfo-ai-log) NOTES_VZ(qnfo-notes) PAPER_VZ(qwav-research-v2) QNFO_AUDIT(d1) QNFO_INFRA(service qnfo-infra) QNFO_INTENT(service qnfo-intent-orchestrator) ROUTER_AUTH_KEY(secret) ROUTER_AUTH_KEY_2(secret) SOCIAL(service qnfo-social) SOCIAL_TOKEN(secret) TASKS_VZ(qnfo-tasks)
   (wrangler.toml does NOT carry the service/secret bindings — a bare wrangler deploy would DROP them.)
4. Read back bindings (expect 22) + /health.
5. Probe: POST /v1/chat/completions model=qwen3-30b prompt="Probe: does auto-express block the response on an opening turn" (no system message) -> expect a QNFO-context answer, NOT "not in literature".
6. Commit: sync deployed-current.worker.js from the new live bundle (per repo convention "sync(qnfo-ai): deployed-current.worker.js from live").
