# qnfo-code-orchestrator v0.1.1

## Self-doc (FLEET-SELF-DOC-1)
- **Purpose**: orchestrates the QNFO 100%-cloud autonomous code agent. v0.1.1 is the
  integration slice - reads repos via qnfo-code-agent (GitHub tool server) and executes
  Python in its OWN Cloudflare Container. v0.2.0 adds the LLM plan loop + edit/PR.
- **v0.1.1 (red-team remediation 2026-09-06)**: /task propagates read errors (never a
  silent ok:true on a failed read; HTTP 502 + read.error on failure); honest capability
  label integration-slice (not autonomous-ready - no LLM yet); /exec output caps (64 KiB,
  stdoutTruncated/stderrTruncated); AUDIT_DB cloud_ops_events logging.
- **Capabilities**: github-read (via code-agent), container-exec (own containers binding).
- **Deploy**: cd qnfo-workers/qnfo-code-orchestrator && wrangler deploy
- **Canonical source**: QNFO/qnfo-workers/qnfo-code-orchestrator
- **Secrets** (fail-closed): ORCH_TOKEN (auth), CODE_AGENT_KEY (call code-agent).
- **Bindings**: AUDIT_DB (qnfo-audit cloud_ops_events).

## Routes
| Route | Method | Auth | Effect |
|---|---|---|---|
| /health | GET | none | liveness + version |
| /task | POST | ORCH_TOKEN | code-agent repo/read + own-container python verify; 502 + read.error on read failure |
| /exec | POST | ORCH_TOKEN | own-container python -c (output-capped) |

## Claim-sheet
- claim: own-container python exec works; evidence: /task exec exitCode 0 + stdout
  'orchestrator-container-ok'; confidence: High (verified same-turn at deploy).
- claim: github-read integration works + errors propagate; evidence: /task read.ok true on
  real file; 502 + read.error on missing file; confidence: High (verified same-turn).
- claim: capabilities label honest; evidence: /health integration-slice, no autonomous-ready;
  confidence: High.

## Roadmap
- v0.2.0: LLM plan loop (DeepSeek via AI Gateway for plan/verdict, kimi for cheap rounds),
  code-agent /v1/repo/edit + create_pr, bounded iterate until container verify passes.
