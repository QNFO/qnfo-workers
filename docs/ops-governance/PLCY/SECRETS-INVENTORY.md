C:/Users/LENOVO/Documents/GitHub/qnfo-ops/PLCY/SECRETS-INVENTORY.md [chars 0-4500 of 5974] (auto-truncated, use offset/limit to read more):
# SECRETS-INVENTORY — QNFO Token/Key/Password Map (2026-09-01)

> Owner: QNFO · Status: ACTIVE · Directive: ALL tokens/keys/passwords live in MULTIPLE REDUNDANT places; for 100% cloud architecture all MUST live in Cloudflare Worker Secrets (canonical store) AND be accessed that way. Values are NEVER recorded in this repo or any git history.
> Audit method: wrangler secret list per worker + local .qnfo inventory + env var names (values redacted).
> Evidence: session 2026-09-01 secrets audit (this doc) · Confidence: high · Status: verified

## 1. Canonical store policy

- **Canonical runtime store = Cloudflare Worker Secrets** (write-only; workers access via env.X).
- **Ops backup = C:/Users/LENOVO/.qnfo/<name>** files, ACL-restricted to the user account (icacls /inheritance:r /grant:r LENOVO\\LENOVO:(OI)(CI)F), used ONLY by operator sessions for wrangler secret put / recovery.
- **Env vars** (Git Bash session): CLOUDFLARE_API_TOKEN + R2 keys + GITHUB_TOKEN + ZENODO_TOKEN etc. are the operator toolchain; they back the worker secrets (2nd/3rd redundant copy).
- **Windows Task copy (2026-09-02)**: C:/Users/LENOVO/.deepchat/secrets/run-backup-daily.cmd (drives scheduled task QNFO-AgentDB-Daily-Backup, daily 21:30) embeds CLOUDFLARE_API_TOKEN - UPDATE THIS COPY ON ROTATION alongside the env var.
- Rotation NEVER rotates a single location: rotate value -> set on ALL workers holding it -> update ALL local copies -> live-probe the consumer (INTENT-TOKEN-ROTATION-1).

## 2. Token matrix (locations; values never shown)

| Token | Worker secrets (cloud) | Local ops backup | Env | Redundancy |
|---|---|---|---|---|
| GITHUB_TOKEN | qnfo-kaizen, qnfo-agent-orchestrator, qnfo-skill-sync, qnfo-cloud-ops(GH_TOKEN) | — | GITHUB_TOKEN | 4 places ✓ |
| DISPATCH_TOKEN | qnfo-idea-triage, qnfo-agent-orchestrator, qnfo-intent-orchestrator | .qnfo/dispatch-token | — | 4 places ✓ |
| KAIZEN_TOKEN | qnfo-kaizen | .qnfo/kaizen-token | — | 2 places ✓ |
| OUTREACH_TOKEN | qnfo-outreach | .qnfo/outreach-token | — | 2 places ✓ |
| IMPACT_TOKEN | qnfo-impact | .qnfo/impact-token | — | 2 places ✓ |
| TRIAGE_TOKEN | qnfo-idea-triage | .qnfo/triage-token (ADDED 2026-09-01, rotated+verified) | — | 2 places ✓ |
| INTENT_TOKEN | qnfo-ai, qnfo-intent-orchestrator, qnfo-tools-mcp | — | — | 3 cloud places ✓ (service token; no local copy by design) |
| ROUTER_AUTH_KEY | qnfo-ai, qnfo-agent-ws | .qnfo/router-auth-key | — | 3 places ✓ |
| ROUTER_AUTH_KEY_2 | qnfo-ai | .qnfo/router-auth-key-2 | — | 2 places ✓ |
| EMAIL_API_KEY | qnfo-ai, qnfo-tools-mcp, qnfo-cloud-ops | — | — | 3 cloud places ✓ |
| GATEWAY_EMAIL_KEY | qnfo-email | — | — | paired with EMAIL_API_KEY across qnfo-ai/email (shared value expected) |
| DEEPSEEK_API_KEY | qnfo-ai | — | — | single place (external provider key, unreadable via API; recovery = regenerate in DeepSeek console) |
| SYNC_TOKEN | qnfo-agent-orchestrator, qnfo-ai-search, qnfo-thread-ingest, qnfo-idea-factory, qnfo-gateway, qnfo-skill-sync, qnfo-agent-ws | .qnfo/ai-search-sync-token (backup for qnfo-ai-search's SYNC_TOKEN) | — | 7 cloud places ✓ + local |
| SOCIAL_TOKEN | qnfo-ai, qnfo-social | — | — | 2 places ✓ |
| BSKY_APP_PASS / BSKY_HANDLE | qnfo-social | — | — | single place — RECOVERY = regenerate in Bluesky dashboard |
| GATEWAY_SOCIAL_TOKEN | qnfo-social | — | — | single place — RECOVERY = regenerate with SOCIAL_TOKEN |
| BUFFER_TOKEN | qnfo-social (ADDED 2026-09-01 from env) | — | BUFFER_TOKEN | 2 places ✓ (unlocks multi-channel P2) |
| ZENODO_TOKEN | qnfo-agent-orchestrator, qnfo-errata-publish | — | ZENODO_TOKEN | 3 places ✓ |
| OSF_TOKEN | — (no worker uses it) | .qnfo/osf-token | OSF_TOKEN | 2 places (legacy/unused by workers — keep as backup) |
| FIGSHARE_TOKEN | — (local research-skill script figshare-submit.py) | — | FIGSHARE_TOKEN | local workflow token; cloud migration = future worker |
| CF_API_TOKEN | qnfo-ai, qnfo-agent-ws, qnfo-lifecycle | — | CLOUDFLARE_API_TOKEN | 4 places ✓ |
| CF_TOKEN | qnfo-cloud-ops, qnfo-intent-orchestrator, qnfo-personal-api, qnfo-infra | — | — | 4 cloud places ✓ |
| INFRA_TOKEN | qnfo-ai, qnfo-infra, qnfo-cloud-ops, qnfo-tools-mcp, personal-api | — | — | 5 cloud places ✓ |
| AUDITOR_TOKEN | qnfo-auditor (ADDED 2026-09-02) | .deepchat/secrets/qnfo-auditor-token.txt | — | 2 places ✓ |
| DIGEST_TO | qnfo-auditor (ADDED 2026-09-02) | — | — | 1 cloud place (audit digest email target; low sensitivity) |
| INDEXNOW_KEY | qnfo-idea-triage | — | — | public key file on papers.qnfo.org (inherently public) |
| MCP_TOKEN | qnfo-tools-mcp | — | — | single place — RECOVERY = regenerate + update MCP config |
| ERRATA_TOKEN | qnfo-errata-publish/respond/watch | — | — | 3 places ✓ |
| OPS_ADMIN_TOKEN | qnfo-cloud-ops | — | — | single place — RECOVERY = rotate in cloud-ops |
| GMAIL_PASS | qnfo-cloud-ops | — | — | single place (legacy) |
| TURNSTILE_SECRET | qnfo-gateway | — | — | single place — RECOVERY = regenerate in CF dashboard |
| TEST_TOKEN | qnfo-agent-orchestrator | — | — | single place (test-only) |
| INDEX_TOKEN | qnfo-intent-orchestrator | — | — | single place (search-index sync) |
| DIGEST_FROM /

## 2026-09-04 UPDATE: INDEX_TOKEN personal-life-indexer
| INDEX_TOKEN | personal-life-indexer | secret_text | 2026-09-04 | rotated; value in .deepchat/secrets/qnfo-agent-tokens.json index_token (skill-doc plx-idx-v1 value was stale since 2026-08-20 redeploy) |
