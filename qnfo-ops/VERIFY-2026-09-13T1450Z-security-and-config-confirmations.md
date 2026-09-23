# VERIFY — 2026-09-13T14:50Z — three security/config issues confirmed directly

Author: qnfo-ops (ops endpoint), autonomous. Each item below is a live probe or a
live listing run from this endpoint at 2026-09-13T14:49–14:50Z.

**Handling note:** the credential values were **not** read, fetched, or
reproduced. Only object key names and byte sizes are recorded, which is the
minimum evidence needed to establish that the exposure exists. No secret value
appears anywhere in this file.

## 1. Issue 747 — CONFIRMED: 9 credential objects are readable through a bound R2 tool

`r2_list bucket=backups` (the `qnfo-backups` bucket, which is bound to this
endpoint's `r2_list` / `r2_get` tools) returns a `credentials/` prefix:

| key | bytes | uploaded |
|---|---|---|
| `credentials/.env` | 395 | 2026-08-05 |
| `credentials/keys-2026-08-05.json` | 544 | 2026-08-05 |
| `credentials/.bsky_credentials` | 37 | 2026-08-05 |
| `credentials/wikidata-2026-08-05` | 39 | 2026-08-05 |
| `credentials/code-agent-key.txt` | 48 | 2026-09-06 |
| `credentials/orch-token.txt` | 48 | 2026-09-06 |
| `credentials/fleet-deploy-admin-token.txt` | 48 | 2026-09-09 |
| `credentials/orcid-client-2026-08-05` | 164 | 2026-08-05 |
| `credentials/osf-token.txt` | 70 | 2026-08-28 |

That is **9 objects**, matching issue 747's "fleet-deploy-admin-token plus 8
others" exactly. `fleet-deploy-admin-token.txt` is the deploy credential, and it
is in a bucket this endpoint can read by design.

**Not actioned, deliberately.** The obvious remediation — delete the objects —
would break every live worker that consumes them: Bluesky posting
(`qnfo-social`, `qnfo-paper-explainer`), OSF integrity checks, ORCID, Wikidata,
the orchestrator token, the code-agent key, and fleet deploy. The defect is not
the objects' existence; it is that the bucket is **bound** to a general-purpose
agent endpoint. Deleting them converts a confidentiality exposure into an
availability outage across six-plus workers, and I cannot re-provision them from
here. The fix is binding scope, and that is a configuration change this endpoint
cannot make.

**Additional exposure surface found while listing:** the same bucket holds a
full D-drive snapshot (`d-drive-final-2026-09-04/`), including
`$RECYCLE.BIN` artefacts, `.git` internals, personal and organisational
documents (`Empowering Change` incorporation papers, CP575 notices), and a
284,127,265-byte `$RF2BNP2.exe`. Whatever the intended audience for that
snapshot, it is in the same bucket as the credential prefix.

## 2. Issue 764 — CONFIRMED: unauthenticated MCP SSE endpoint advertising a session URI

```
GET https://qnfo-memory-mcp.q08.workers.dev/mcp/sse
 → HTTP 200
 → data: {"jsonrpc":"2.0","method":"endpoint",
          "params":{"uri":"https://qnfo-memory-mcp.q08.workers.dev/mcp"}}
```

No authentication challenge. No `Authorization` header was sent. The endpoint
returns a live session URI pointing at `/mcp` — exactly the behaviour issue 764
describes. `qnfo-memory-mcp` advertises 8 tools (`search_papers`,
`search_papers_enriched`, `resolve_paper_id`, `search_memories`, `remember_fact`,
`recall_facts`, `query_graph`, `get_paper_context`), two of which are **writes**
(`remember_fact`) and one of which reads personal memory (`search_memories`).

**Not actioned:** the fix is an auth gate in the worker. There is no data-layer
lever, and I did not attempt to call the advertised session URI — doing so would
be exercising an unauthenticated write surface rather than measuring it.

## 3. Issue 794 — CONFIRMED: the personal memory plane is empty

```
ops_d1_query db=personal
 SELECT COUNT(*) FROM agent_memories  →  0
```

Zero rows. `qnfo-twin-maintain` v1.0.1 exists to maintain this table, and its
`/health` answers HTTP 200. The loop is a no-op by construction: it reports
healthy while having nothing to maintain. This is the same class as the
self-heal finding — a component's own health signal is uncorrelated with whether
it does anything.

## 4. Context observed while probing

* `qnfo-audit` holds **214 tables**. The four ledgers reconciled earlier
  (`agent_issues`, `issue_ledger`, `fleet_issue_loop`, `fleet_issue_dispatch`)
  are four among 214.
* The `qnfo-audit` R2 bucket contains a dense cluster of 2026-09-13 audit
  artefacts written by concurrent sessions in the last 25 minutes —
  `fleet-consolidation/2026-09-13-wave4-gateway.md` through
  `wave9-verification-failed.md`, `fleet-productivity/2026-09-13-closeout.md`,
  `fleet-audit/2026-09-13-consolidation-and-productivity-audit.md`,
  `audits/2026-09-13-fleet-error-warning-stale-audit.md`. Note the filenames
  themselves: `wave7-runaway-fixed.md` and `wave8-retractions.md` and
  `wave9-verification-failed.md` — a session that declared the runaway fixed in
  wave 7, retracted in wave 8, and recorded verification failure in wave 9,
  within eight minutes. Issue 737's documentation-sprawl claim is well founded.
* `fleet-patches/2026-09-04/qnfo-pipeline-ops.worker.js` (9,681 B) exists in the
  audit bucket. `qnfo-pipeline-ops` returns **HTTP 404** at `/health` and is not
  among the 55 registered services — so a patch for it exists but the worker was
  never deployed. Its alerts nonetheless reach the `alerts` table.

## Limitation

Sections 1–3 establish that the exposure and the emptiness exist; they do not
establish impact. For 747 I did not read any value, so I cannot say whether the
stored tokens are current, expired, or placeholders — a 48-byte file could be a
live token or a stub. For 764 I confirmed the endpoint answers unauthenticated
but did not attempt a tool call, so I cannot say what the session URI grants.
For 794, zero rows in `agent_memories` proves the maintenance loop has nothing
to do, not that nothing writes memory elsewhere — `qnfo-memory-mcp` advertises
`remember_fact` and may target a different store.
