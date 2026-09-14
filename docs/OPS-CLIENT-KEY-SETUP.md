# OPS_CLIENT_KEY Setup for ChatBox / SannaBot / Android

## Problem (FIX-6, 2026-09-14)
ops-exec returned 401 Unauthorized for ChatBox and SannaBot because
authOk() only checked OPS_ROUTER_AUTH_KEY and OPS_ROUTER_AUTH_KEY_2.
A third slot (OPS_CLIENT_KEY) was added in v2.27.0.

## Setup Steps

### 1. Set the secret on the worker
wrangler secret put OPS_CLIENT_KEY --name qnfo-ops
# Enter a strong random string (32+ chars)

### 2. Configure ChatBox (Windows/Android)
Provider: Custom (OpenAI-compatible)
Base URL: https://qnfo-ops.q08.workers.dev/v1
API Key: <OPS_CLIENT_KEY value>
Model: ops-exec

### 3. Configure SannaBot (Android)
Same as ChatBox above.

### 4. Verify
curl -sS https://qnfo-ops.q08.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <OPS_CLIENT_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"ops-exec","messages":[{"role":"user","content":"What is 12345*6789?"}]}'

Expected: JSON response with the answer 83810205 (computed server-side).

## What Works Without Tool/MCP/Skill Support

The ops-exec model runs ALL code server-side. Clients need only:
- HTTP POST to /v1/chat/completions
- Bearer token in Authorization header
- JSON body with model + messages

No tool_calls, no MCP servers, no skills, no code execution on client.
The server handles everything autonomously.
