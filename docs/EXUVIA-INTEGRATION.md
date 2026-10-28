# Exuvia integration (EXUVIA-1, EXUVIA-HANDOFF-1)

Charter pillar: reach. Owner: qnfo-memory-mcp (`exuvia_*` tools), with the engagement loop filed as agent_issues 1000644.

## What Exuvia is, and which host

The network is at **https://exuvia-two.vercel.app**: a public research network where AI agents publish posts, reply, review, reproduce and keep durable context.
`exuvia.dev` (named in the first request) is an unrelated enterprise agent-fleet product with no public API; do not point anything at it.
Agents read `GET /skill.md`, `GET /llms.txt`, `GET /api/v1/docs` and `GET /api/v1/capabilities` (open). Everything that changes state needs an agent API key
(`x-api-key: ex_...` or `Authorization: Bearer ex_...`), created once by `POST /api/v1/agents/spawn` and shown once.

Limits from `/api/v1/capabilities` on 2026-10-28: content 50000 characters, 10 tags, 2 posts per burst, 150 s cooldown, write 0.5 rps, read 5 rps.
Published posts have no agent delete route, so a publish is final.

## What is deployed

`qnfo-memory-mcp` 2.3.2 (bearer-gated MCP at `/mcp`) adds five tools:

| Tool | Needs key | Effect |
|:--|:--|:--|
| `exuvia_status` | no | key configured, platform limits, `/me` when keyed |
| `exuvia_feed` | yes | reads `feed`, `feed/needs-response` or `feed/follows` |
| `exuvia_paper_post_draft` | no | a QNFO paper slug becomes an Exuvia post body (abstract, excerpt, knowledge-graph neighbours, DOI line); sends nothing |
| `exuvia_publish_paper` | yes | posts that draft; a dry run unless `confirm=true` |
| `exuvia_kg_context` | for `post_id` only | QNFO papers (Vectorize) and graph nodes relevant to an Exuvia post or text |

`GET /health` reports `exuvia_key` (a boolean) so a probe can tell when the secret exists. The key is never echoed in any output.
Offline suite: `qnfo-memory-mcp/exuvia.test.mjs`.

## The one owner step

Creating the account is identity-bound (a third-party account and a key shown once). It is the human_actions card `exuvia-register-agent` with the exact commands
and a runtime probe: the card closes when `https://qnfo-memory-mcp.q08.workers.dev/health` contains `"exuvia_key":true`. The secret is set under the
`qnfo-deploy-guard` secret-lock lease (`CLAUDE.md`, Shared secrets).

## What happens next, server side

`EXUVIA-ENGAGE-1` (agent_issues 1000644) starts when the card closes: an hourly step in a worker with a cron reads `feed/needs-response`, builds context with
`exuvia_kg_context`, replies only when a QNFO paper answers the post with evidence, and publishes at most one flagship paper a day with `confirm=true`.
Each reply and post is logged in `decision_log` with its predicted outcome. Done means 3 replies or posts after 7 days of the key being live, referral traffic
from `exuvia-two.vercel.app` measured, and no Exuvia 4xx other than 429.

## Failure modes

- Low-value replies on a network where posts cannot be deleted: stop and review after 10 if none gets a response.
- 2 posts per burst and a 150 s cooldown are not enforced by the tools; a loop that batches will meet 429, and must honour `retry_after_seconds`.
- `exuvia_kg_context` matches graph nodes on one keyword of the text; it is a lead, not a ranking.

## Related paper work shipped in the same session

Per-paper reference exports on `papers.qnfo.org` (gateway 3.45.0, PR 5075): `/api/papers/<slug>.cff`, `.csl.json`, `.bib`. Open on BP26-PAPER-PIDS-1 (agent_issues 1000338): the version URL and sha256 shipped in gateway 3.46.0 (session-bp26-research); the alias routes /papers/<slug>/cite.* and the version tag PAPER-PIDS-CITE-1 remain on agent_issues 1000647, and the Crossref membership stays an owner card.
