# Composio and the DeepSeek harness (COMPOSIO-1, DSH-LESSONS-1)

Charter pillars: cost (DeepSeek harness lessons), reach and autonomy (Composio). Written 2026-10-29 from a read of
https://composio.dev/content/deepseek-harness-vs-claude-code, https://composio.dev/ and https://docs.composio.dev/.

## 1. Claude Code performance on DeepSeek at near-zero cost

Already true in the fleet: `scripts/model-policy.json` lists `deepseek-v4-flash-wa` and `deepseek-v4-pro-wa` (Workers AI, 1M context), and
Claude Code reaches them through `ANTHROPIC_BASE_URL=https://ai.qnfo.org` (qnfo-router, model inference only; execution stays in qnfo-ops).
So the model half of "Claude Code on DeepSeek" needs no new build.

What the article adds (benchmark of the same DeepSeek V4 Pro through two harnesses, 30 hard tasks):

| | DeepSeek Harness (`dsh`, MIT, 2026-08-13) | Claude Code |
|:--|:--|:--|
| Pass | 20/30 | 19/30 |
| Tokens per task | 88,562 | 649,900 (7.3x) |
| Cost per shared success | $0.028 | $0.074 |

The gap is context carry-through per step, not model quality. Levers for the fleet, in order of cost:

1. Keep Claude Code, point it at the router, and cut context: short CLAUDE.md, subagents for wide reads, `/compact` earlier. No build.
2. Make the router cache-aware for DeepSeek (provider-coupled caching made Claude Code pay about 99% of uncached rates on gateways; other harnesses paid 23-55%). Filed as RM-DSH-CACHE-1.
3. Adopt three `dsh` design ideas in the fleet's own agent loops: model-visible equals logged (assert outgoing requests match the session log), keyless transcript replay (recorded `.jsonl` fixtures with a mock model), and a fail-closed sandbox ladder (read-only default, explicit escalation). Filed as RM-DSH-REPLAY-1.
4. Running `dsh` itself is not recommended yet: developer preview, about 80 plugins, mostly DeepSeek-owned, local web UI on 127.0.0.1:3080 and a session log that holds sensitive prompts. Failure mode: it breaks on update and is a second harness outside the canonical path.

## 2. What Composio is

A managed integration layer for agents: 1,500+ app toolkits (Gmail, Google Calendar, Drive, Slack, Notion, GitHub, HubSpot...), with OAuth and API-key
lifecycle (consent screen, storage, refresh) handled by Composio. It exposes the same tools through a REST API
(`https://backend.composio.dev/api/v3.1`, header `x-api-key`), SDKs (`@composio/core`, Python `composio`) and an MCP URL per session
(`session.mcp.url`, `session.mcp.headers`). Free Hobby plan: 100,000 tool calls a month. SOC 2 Type II.

## 3. Using it from the Quniverse without manual intervention

Shape: qnfo-ops (sole executor) calls Composio's REST `execute` from a Worker `fetch`; the Composio key is one Worker secret. A Worker needs no SDK.
Per toolkit (Google, GitHub, Slack...) the owner completes one consent click; after that Composio refreshes tokens and every call is autonomous.

| Step | Who | Status |
|:--|:--|:--|
| Create Composio account, project API key | owner (account creation is identity-bound) | open |
| `wrangler secret put COMPOSIO_API_KEY` under the secret lock | fleet | after the key exists |
| Google consent, one link per toolkit (`session.authorize`) | owner, once | after the key exists |
| `composio_execute` and `composio_status` tools in qnfo-ops | fleet (RM-COMPOSIO-BRIDGE-1) | filed |

### qnfo-ops bridge contract

The bridge uses the Composio REST API directly; it adds no SDK or runtime
dependency. Configure `COMPOSIO_API_KEY` as a qnfo-ops Worker secret under the
secret lock, and set `COMPOSIO_USER_ID` to a dedicated **non-personal** Composio
user. The bridge fails closed when either value is missing. Do not configure
the personal Composio user on qnfo-ops: personal services remain on
`personal-api`, and their connected-account IDs must not be passed to these
tools.

`composio_status` accepts a `connected_account_id`, reads
`GET /api/v3.1/connected_accounts/{id}`, and returns only its status and toolkit
slug after verifying that the account's `user_id` matches the configured
non-personal user. `composio_execute` accepts that account ID, a toolkit
`tool_slug`, and a JSON object of `arguments`; it applies the same ownership
check, requires an `ACTIVE` account, and calls
`POST /api/v3.1/tools/execute/{tool_slug}`. Account IDs and tool slugs are
validated, arguments are limited to 32 KiB, account reads time out after 15
seconds, and execution requests after 60 seconds. qnfo-audit receives only
action metadata and success/status; it does
not retain connected-account IDs, argument values, or provider results. The
tool's execution result is returned to its authenticated caller.

The bridge code does not provision Composio credentials or OAuth connections.
Until the secret, non-personal user ID, and consented account connections are
configured, these tools remain unavailable.

Risks and counter-arguments, stated plainly:
- It is a third-party custodian of Google refresh tokens and a new runtime dependency on a vendor (ANTIFRAGILE-1: needs a second path). The fleet already holds its own Google/Outlook links for the Today dashboard; keep those and use Composio for the long tail of services, not as the only path.
- Personal/research separation: personal Google data (calendar, mail) must go through a separate Composio `user_id` used only by personal-api; research workers never get that user. Tool-call logs go to qnfo-audit without payloads.
- Outreach through Gmail still obeys consent, suppression and opt-out (qnfo-outreach), whatever the transport.
- Free-tier quota (100k calls) is a cap, not a hard stop: meter calls and fall back to direct APIs.

## 4. Files

Roadmap items are filed by `migrations/2026-10-29-composio-roadmap-items.sql`.

## 5. Alternatives that fit Cloudflare and cost nothing (checked 2026-10-29)

| Option | Runs on Cloudflare? | Cost | Verdict |
|:--|:--|:--|:--|
| Own OAuth broker in a Worker (Google OAuth, `workers-oauth-provider`, tokens in D1, refresh on the hourly tick) | Yes, native | Free (Google APIs are free) | Best fit; the fleet already holds Google links. Build for Google, GitHub, Slack first (RM-OAUTH-BROKER-1). |
| Agents SDK MCP client in `qnfo-agents` calling remote MCP servers | Yes, native | Free | Use for any service that publishes a remote MCP server. |
| Nango (Elastic License 2.0) | No: Node plus Postgres, needs a container host | Auth and proxy free self-hosted; full platform is Enterprise | Only if a container host is acceptable. |
| n8n, Activepieces | No: Node plus a database | Free self-hosted | Workflow engines, heavier than a tool layer. |
| Pipedream Connect, Arcade, Paragon | No: hosted, closed engines | Free tiers with caps | Same custody risk as Composio, no advantage. |

Most comparisons found are vendor blogs (Nango's among them), so treat their rankings as marketing. Recommendation: build the in-Worker broker and keep Composio as the long-tail fallback inside its free 100k calls.
