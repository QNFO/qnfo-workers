# ops-exec: 100% Server-Side Execution Across All Chat Clients

Date: 2026-09-09 · Generator: qnfo-ops endpoint (service v2.7.0) · Document version: 1.1
Status: GENERATED canonical instruction text - live application requires device-side store writes + worker code deploy (see section 7).
v1.1 (2026-09-09): adds paste-ready per-client instruction blocks (section 8), live probe evidence (section 6.6), verified Sanna characterization + falsifier observation (section 7).

## 1. Directive (WHAT / WHY)

Operator directive 2026-09-09: 100% server-side code execution - ONLY. No local tool code, no local tool calls - for four client classes against the ops-exec endpoint:

1. DeepChat Windows
2. ChatBox Windows
3. ChatBox Android
4. SannaBot Android

Every code/tool operation executes on Cloudflare inside qnfo-ops. Clients are dumb terminals: render text, never execute.

## 2. Endpoint contract (ground truth: service registry 2026-09-09T14:30:03Z)

| Field | Value |
|---|---|
| service / kind | qnfo-ops / worker, version 2.7.0 (snapshot 2026-09-09; deployed 2.9.3 on 2026-09-10 - see section 9) |
| base_url | https://qnfo-ops.q08.workers.dev |
| chat route | POST /v1/chat/completions (OpenAI-compatible); /v1/responses supported; GET /v1/models |
| models | ops-exec (QNFO-OPS/ops-exec, default) - deepseek-v4-flash (explicit relay only) |
| auth | Bearer OPS_ROUTER_AUTH_KEY (secret - reference by name only, never echo) |
| audit | every request -> qnfo-audit.ops_ai_log with source + strategy |
| compute | run_code isolated JS + all data tools, server-side only |

## 3. System-prompt gate paragraph (paste-ready; v4.21 candidate)

MANDATORY (2026-09-09, system-prompt v4.21 / kaizen v2.142 / SERVER-SIDE-EXEC-100-1): preserve the four-client 100%-server-side-execution gate (operator directive 2026-09-09: 100% SERVER-SIDE CODE EXECUTION ONLY across DeepChat Windows, ChatBox Windows, ChatBox Android, SannaBot Android - no local tool code, no local tool calls, no finish_reason=tool_calls to any client) - SERVER-SIDE-EXEC-100-1 (qnfo-ops v2.7.0 endpoint https://qnfo-ops.q08.workers.dev POST /v1/chat/completions, bearer OPS_ROUTER_AUTH_KEY, model QNFO-OPS/ops-exec is the SOLE executor of every code/tool operation - run_code / ops_d1_query / vectorize_query / r2_* / kv_* / workspace_* / email_* / fleet_* / web_* / github_* / issue_* / telemetry_* all run on Cloudflare; the four clients are OpenAI-compatible REST terminals and MUST never execute code locally, never invoke local tools from an ops-exec chat, and never receive a client-executable tool_calls payload; SUPERSEDES the v4.20 hybrid carve-out for source=="deepchat" - the pure server-side loop is now universal and detectSource remains for audit labeling only, strategy never yields hybrid client-handoff for any source; [STATUS 2026-09-10 DONE: the hybrid carve-out is REMOVED in deployed qnfo-ops v2.9.3 - the endpoint is pure server-side for ALL clients and never returns a client tool_calls. See section 9.] DeepChat / ChatBox / Sanna system prompts embed this block so the client itself forbids local execution; verify per-client probes - from each of the four clients, "run run_code: 12345*6789" MUST return 83810205 with zero client-side execution, and "fleet status" MUST return live /health data - plus ops_ai_log rows carry the correct source per client + all four model keys QNFO-OPS/ops-exec + 7-store prompt parity + prompt-store-verify.py exit 0 + scheduler-guard.py exit 0 + model_guard.py exit 0 after every dual-write (PROMPT-PARITY-1).

## 4. Client configuration matrix

| Client | Config surface | Provider entry | Model | Local-exec posture |
|---|---|---|---|---|
| DeepChat Windows | agent.db app_settings + Roaming app-settings.json (all four keys) | QNFO-OPS - https://qnfo-ops.q08.workers.dev - path /v1 | QNFO-OPS/ops-exec | Remove Code Mode / file / terminal tools from the ops-chat agent toolchain; embed gate section 3 + rule 11 in the agent system prompt; no client tool_calls handoff |
| ChatBox Windows | Roaming config.json (xyz.chatboxapp.app) | qnfo-ops - host above - path /v1/chat/completions | ops-exec | Remote OpenAI provider executes nothing locally; keep plugins/artifacts/web-search toggles off for ops chats |
| ChatBox Android | on-device provider entry (per QNFO-OPS-ChatBox-Android-Setup.md 2026-09-03) | same host/path | ops-exec | UA Dart/Flutter/OkHttp -> source=mobile -> pure server loop (verified 2026-09-09 probe okhttp; probes section 6.6) |
| SannaBot Android | Sanna custom-endpoint / agent-profile settings | same host/path | ops-exec | Sanna is an ON-DEVICE ACTION AGENT by design (verified repo sannabotdev/sannabotapp, README 2026-09-09: "actually controls your phone", Accessibility UI automation, LLM agent loop, sub-agents, no backend) - structurally the inverse of 100% server-side: use a tools/actions-OFF profile for ops-exec chats and treat ops conversations as text-only Q&A; endpoint never returns tool_calls so no client-executable payload can arrive |

## 5. Server-side capability inside the loop (what clients may ask the endpoint to run)

fleet_status - ops_issues_list - ops_d1_query (8 D1) - vectorize_query (5 indexes) - r2_* (4 buckets) - kv_get - research_queue / intents_query / candidates_query - backlog_status - service_discover - cf_analytics - telemetry_report / telemetry_analyze - email_check / email_stats / email_mark / email_respond - ops_fleet_log - run_code - web_fetch / web_search - github_repo_read / github_file_write / github_pr - workspace_read / workspace_write / workspace_list / workspace_delete. All server-side on Cloudflare.

## 6. Verification protocol (server-side, same turn)

1. Per client, probe A: "run run_code: compute 12345*6789 and show the result" -> answer text contains 83810205; zero client-side execution attempted.
2. Per client, probe B: "show fleet status" -> live /health data (worker names + versions), not a client-side computation.
3. ops_fleet_log / ops_ai_log: rows for each request carry the expected source (deepchat / chatbox / mobile / other) and finish=stop; no finish_reason=tool_calls handed to a client that cannot execute.
4. Registry: service_discover returns qnfo-ops v2.7.0 with models ops-exec + deepseek-v4-flash.
5. Host-side after any prompt-store write (device-bound, run by the host agent): prompt-store-verify.py exit 0 + scheduler-guard.py exit 0 + model_guard.py exit 0 + all four model keys QNFO-OPS/ops-exec.
6. Observed probe evidence (qnfo-audit.ops_ai_log, 2026-09-09): (a) 14:02:07Z source=mobile strategy=agent-tools ok=1 "Use the run_code tool to compute 12345 * 6789 ... Execute it yourself server-side." -> probe A PASS for a mobile-class client; (b) 14:17:16Z source=mobile strategy=agent-tools ok=1 "Use run_code to compute 7*11 ..." -> probe A PASS; (c) 14:42:41Z source=mobile strategy=chat ok=1 (naming round); (d) 13:34:39Z source=chatbox ok=1. CAUTION: (e) 14:07:35Z source=deepchat strategy=hybrid-chat ok=1 - DeepChat was still served hybrid on v2.7.0; see falsifier in section 7.

## 7. Boundaries & failure modes (adversarial)

- This endpoint cannot write the Windows/Android host stores or run the host guard scripts. Applying the gate = host-agent dual-write to the 7 prompt stores + repo commit + wrangler deploy from the canonical dir + real-client probes. This document is the instruction set; it is NOT proof of application.
- The worker behavior change (hybrid removal, universal pure loop) requires a code change in the qnfo-ops repo + deploy + model check + one real chat per client. Curl-only verification does not exercise real clients (v4.15 rule). FALSIFIER (observed 2026-09-09T14:07:35Z): ops_ai_log row strategy=hybrid-chat source=deepchat proves the v4.20 carve-out is still ACTIVE on the deployed v2.7.0 worker - do NOT claim the DeepChat pure server-side loop is live until a post-deploy row shows strategy without hybrid for source=deepchat.
- SannaBot identity VERIFIED 2026-09-09 (github_repo_read sannabotdev/sannabotapp README, sha c928d4e9): "Sanna - Open-Source Voice-First AI Assistant for Android" that "actually controls your phone" via an LLM agent loop + Android Accessibility UI automation + background sub-agents, "work without a backend", on-device storage, OpenAI or Claude models, MIT license. It reads/sends the user's OWN on-device email/messages/SMS by design - that is NOT the qnfo-ops email pipeline and must never be conflated with it. Structural tension with 100% server-side is CONFIRMED, not hypothetical: Sanna's action layer MUST be off for ops-exec chats (tools/actions/skills/sub-agents disabled for that profile) and ops conversations treated as text-only Q&A; alternatively exclude Sanna from ops chats entirely. Sanna's exact custom-endpoint capability (arbitrary OpenAI-compatible base URL override) is still unverified from the repo - device probe required.
- Removing the DeepChat hybrid carve-out may regress flows where DeepChat natively executed tools. Monitor ops_ai_log for a rise in provider_error or changed finish reasons after deploy.
- Falsifier: any ops-exec chat answered via client-side execution, or any ops_ai_log row with finish_reason=tool_calls to a non-executing client, disproves the gate.
- Cost/trust note: server-side execution centralizes compute under the OPS_ROUTER_AUTH_KEY secret; key rotation must update all four clients the same cycle.

## 8. Paste-ready instruction blocks (v1.1)

### 8.1 DeepChat Windows - system prompt additions

Embed the section 3 MANDATORY paragraph into the DeepChat default system prompt (next dual-write cycle) AND keep rule 11 verbatim:

"11. SERVER-SIDE-EXECUTION GUARANTEE (binding): the client you serve may be a mobile/Android LLM client (e.g. ChatBox Android) with NO native ability to run code, open files, execute shell commands, or invoke tools on-device - ALL code and tool calls MUST execute server-side on Cloudflare, never on the client device. You are the SOLE executor of every code/tool operation. NEVER emit code, shell commands, SQL, or tool-call syntax FOR the client to run locally, and NEVER ask the user to run/paste/open/install anything on their device (the client cannot do it). For every request involving compute, data, files, web, mail, fleet, or repos, execute it YOURSELF server-side via run_code / ops_d1_query / workspace_* / r2_* / web_fetch / web_search / email_* / fleet_status / github_* and return the COMPLETED result with evidence."

Agent-configuration posture for the ops-exec agent in DeepChat Windows: model QNFO-OPS/ops-exec in all four keys (agent.db app_settings defaultModel + preferredModel; Roaming app-settings.json defaultModel + preferredModel - model_guard.py enforces); remove Code Mode, file, terminal, and subagent-orchestrator tools from the ops agent toolchain so the client sends no client tool list and every round answers finish=stop from the server.

### 8.2 Universal client custom-prompt block (ChatBox Windows, ChatBox Android, SannaBot Android)

Paste into each client's system-prompt / custom-prompt field for the ops-exec provider:

SERVER-SIDE EXECUTION CONTRACT (binding):
1. All code, data, file, fleet, and tool operations in this chat execute server-side on the qnfo-ops endpoint (Cloudflare). You have no local execution capability here and must never assume one.
2. NEVER output code blocks, shell commands, SQL, file paths, install steps, or tool-call syntax for the user to run, paste, open, or install locally. The client cannot execute them; never ask the user to act as your terminal.
3. For any request involving computation, data, files, the fleet, email, the web, or repositories, call the matching qnfo-ops tool (run_code, ops_d1_query, vectorize_query, r2_list/r2_get, kv_get, workspace_read/workspace_list, web_fetch, web_search, email_check/email_stats, fleet_status, service_discover, backlog_status, telemetry_report, ops_issues_list, intents_query, candidates_query, github_repo_read) and report the COMPLETED result with the tool's actual output as evidence.
4. Pure computation runs through the run_code tool on the endpoint; report its returned value verbatim. Prefer the tool over in-head arithmetic whenever the answer is a number or a checkable fact.
5. If a tool errors or is unavailable, report the exact error text. Never fabricate a result, count, version, or status.
6. Never ask the user to verify, re-run, or re-type anything a server-side tool can do. If you cannot execute a requested operation server-side, say so plainly and stop.

### 8.3 Client configuration recap (one line each)

- DeepChat Windows: provider QNFO-OPS, base https://qnfo-ops.q08.workers.dev, path /v1, model QNFO-OPS/ops-exec, API key = OPS_ROUTER_AUTH_KEY value (reference by name only).
- ChatBox Windows: provider qnfo-ops, host https://qnfo-ops.q08.workers.dev, API path /v1/chat/completions, model ops-exec; plugins/artifacts off for ops chats.
- ChatBox Android: same host/path/model per QNFO-OPS-ChatBox-Android-Setup.md (2026-09-03, notes/v1/2026/09/03/ in the Obsidian vault / R2 bucket obsidian-vault (D: drive retired)\).
- SannaBot Android: custom endpoint same host/path/model; tools/actions/skills/sub-agents OFF for the ops profile (identity verified - on-device action agent; see section 7).

## 9. Deployment status (2026-09-10 - verified against the DEPLOYED bundle)

- Deployed worker: qnfo-ops v2.9.1 (live /health). Repo copy is stale at v1.9.8 and still carries the OLD hybrid predicate (source != chatbox) - a REGRESSION LANDMINE: deploy the repo as-is and mobile/other clients re-enter hybrid. Reconcile the repo to the deployed bundle before any redeploy (WORKER-EDIT-BASE-VERIFY-1 / DEPLOY-LAST-WINS-RECONCILE-1).
- Deployed hybrid predicate: const hybrid = !!clientTools && source === deepchat - ONLY UA class deepchat can receive a client tool_calls payload.
- detectSource (deployed): deepchat OR ai-sdk -> deepchat; chatbox|dart|flutter|okhttp|dalvik|android|retrofit|mobile -> mobile; else other.
- Consequence: mobile (ChatBox Android, SannaBot) and chatbox/other clients get the PURE server-side loop and never a client tool_calls - the mobile-ops contract holds.
- DONE (2026-09-10): the deepchat hybrid carve-out was REMOVED and deployed as qnfo-ops v2.9.3 (qnfo-workers commit a6f2f14; Version ID 41e5d832). Deployed predicate hybrid=false; the endpoint is pure server-side for ALL clients and never returns a client tool_calls. Verified this cycle: /health v2.9.3 + capability pure-server-exec (was hybrid-tools); /v1/models ops-exec described as pure server-side loop; DeepChat-UA probe with client tools + run_code returned finish=stop, tool_calls=false, server executed run_code (83810205). Rollback baseline: .deepchat/backups/qnfo-ops-2.9.1-clean.js.
