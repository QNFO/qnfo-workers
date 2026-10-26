# The agent action audit log (BP26-AUDIT-LOG-1)

Charter pillar: security. Live since 2026-10-26 (migrations/2026-10-26-bp26-audit-log.sql, PR 4768; collectors in scripts/bp26_auditchain.py).
Metrics: `audit_chain_verify` (1 when the whole chain recomputes), `audit_coverage` (share of side effects that have a row, judged against records the log does not write).

## What it records

`qnfo-audit.agent_actions`: one row per side effect, append-only (BEFORE UPDATE and BEFORE DELETE triggers abort; nothing in a code path updates or deletes it).

| action_kind | written by | source ledger |
|---|---|---|
| deploy, settings, secret-write, rollback | AFTER INSERT trigger | `fleet_deploys` (classified by the rules of qnfo-deploy-guard: `SETTINGS-ONLY`, `SECRET-ONLY`, rollback markers); a failed deploy is a row with outcome `failed` |
| send | AFTER INSERT trigger | `emails` rows inserted with status sent or replied; the target is the recipient domain only, never the address |
| publish | AFTER INSERT trigger | `social_media_posts` (status published), `social_threads` (status becomes posted) |
| publish (papers, q08 pieces) | the runner (`via = runner-mirror`) | `living-paper.paper_change_ledger` and `q08-signal.published_pieces`: other databases, which a trigger cannot reach |

Columns: `id, ts, actor, session, tool, action_kind, target, inputs_hash, outputs_hash, version_id, cost, outcome, source_table, source_id, via`. `(source_table, source_id)` is unique, so a
second writer or a replay never double-writes. `via` says how the row arrived: `trigger`, `backfill` (the last 8 days of each ledger, written when the table was created) or `runner-mirror`.
`actor` is what the source ledger says (a paper change with no actor is recorded as `unattributed`; 252 of 387 paper publish events in the first week were).

## The hash chain

SQLite has no sha256, so the runner seals (scripts/bp26_auditchain.py, every consumer run, at most 1200 rows a run):
`row_hash = sha256(prev_hash + "|" + canonical)`, `prev_hash` of the first row is 64 zeros, and `canonical` is the JSON array of the row's columns in the order above
(`id, ts, actor, session, tool, action_kind, target, inputs_hash, outputs_hash, version_id, cost, outcome, source_table, source_id, via`), separators `,` and `:`, ASCII only.
Rows go to `agent_action_chain (seq, action_id, prev_hash, row_hash, sealed_at)`, also append-only. A row is exposed to rewriting only between its insert and its seal (one run).
Each UTC day's first run writes the chain head to `agent_action_roots` and to R2 `qnfo-backups/audit-chain/<day>.json`; the verifier checks every root against the chain and the latest root against its R2 copy.

Verify it yourself (read-only; rows from `SELECT * FROM agent_actions ORDER BY id` and `SELECT * FROM agent_action_chain ORDER BY seq`):

```python
import hashlib, json
COLS = ("id","ts","actor","session","tool","action_kind","target","inputs_hash","outputs_hash","version_id","cost","outcome","source_table","source_id","via")
prev = "0" * 64
for a, c in zip(actions, chain):                       # both ordered, a["id"] == c["action_id"]
    h = hashlib.sha256((prev + "|" + json.dumps([a[k] for k in COLS], separators=(",", ":"), ensure_ascii=True)).encode()).hexdigest()
    assert c["prev_hash"] == prev and c["row_hash"] == h, c["seq"]
    prev = h
```

## Coverage, and what it does not claim

`audit_coverage` = rows found / events found, over the classes that have a record outside the log, for the last 7 days ending 30 minutes ago (a ledger row needs time to land):

- deploy, settings, secret-write, rollback: Cloudflare Workers deployments (API), independent of every D1 ledger; a match is a row for the same worker within 20 minutes;
- publish on Mastodon: the account's public timeline, independent;
- publish of papers and q08 pieces: counted against their own databases. The runner is their writer, so this checks the mirror, not the publisher.

Named in the evidence rows (`bp26_probe_results`, metric `audit_coverage`) and not counted: sent mail and the posts routed through Buffer or Bluesky roll-ups (ledger parity only, no outside record the runner
token can read), and a secret written outside the fleet ledger (Cloudflare shows it as a deployment, which the deploy class counts once it is ledgered).
Not built yet and owned in BP26-AUDIT-LOG-1: the weekly FinOps digest per worker and loop, a `cost` value (every row has none today), outside matching for mail and Buffer platforms, and monthly sharding (revisit at about one million rows; the log grows about 3000 rows a week).

Look-ups: `SELECT action_kind, outcome, COUNT(*) FROM agent_actions WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days') GROUP BY 1, 2;` and `SELECT * FROM bp26_probe_results WHERE metric = 'audit_coverage' ORDER BY id DESC LIMIT 20;`.
