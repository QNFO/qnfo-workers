# qnfo-code-orchestrator v0.1.0

## Self-doc (FLEET-SELF-DOC-1)
- **Purpose**: orchestrates the QNFO 100%-cloud autonomous code agent. v0.1.0 is the
  integration slice - reads repos via qnfo-code-agent (GitHub tool server) and executes
  Python in its OWN Cloudflare Container. v0.2.0 adds the LLM plan loop + edit/PR.
- **Capabilities**: github-read (via code-agent), container-exec (own containers binding).
- **Deploy**: cd qnfo-workers/qnfo-code-orchestrator && wrangler deploy
- **Canonical source**: QNFO/qnfo-workers/qnfo-code-orchestrator
- **Secrets** (fail-closed): ORCH_TOKEN (auth), CODE_AGENT_KEY (call code-agent).

## Routes
| Route | Method | Auth | Effect |
|---|---|---|---|
| /health | GET | none | liveness + version |
| /task | POST | ORCH_TOKEN | code-agent repo/read + own-container python verify |
| /exec | POST | ORCH_TOKEN | own-container python -c |

## Claim-sheet
- claim: own-container python exec works; evidence: /task exec exitCode 0 + stdout
  'orchestrator-container-ok'; confidence: High (verified same-turn at deploy).
- claim: github-read integration works; evidence: /task read.ok true + sha/size; confidence: High.

## Roadmap
- v0.2.0: LLM plan loop (DeepSeek via AI Gateway for plan/verdict, kimi for cheap rounds),
  code-agent /v1/repo/edit + create_pr, bounded iterate until container verify passes.
