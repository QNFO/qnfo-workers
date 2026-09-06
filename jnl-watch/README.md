# jnl-watch

Zenodo `aiscience` community watcher - isolated journal overlay stack (`jnl-*`).
Polls `https://zenodo.org/api/communities/87f14e85-7156-4146-84e9-9e3a11e29c1d/records` (size 25, max 40 pages), stores new/updated metadata in D1 `jnl-audit` (`jnl_records`, `jnl_polls`) and a KV `jnl-state` cursor.

- Version: 0.1.6
- Cron: `*/10 * * * *`
- Endpoints: `/health` `/poll` `/records`
- Isolation: dedicated D1 jnl-audit, KV jnl-state, Vectorize jnl-corpus, R2 jnl-parse-cache (no QNFO-research mix)
- Status: P2 (ingest) of the AI-reviewed journal overlay (see qnfo-ops docs + jnl-referee worker)

Deploy (from this dir): `wrangler deploy`. `deployed-current.worker.js` must stay byte-identical to the live bundle.
