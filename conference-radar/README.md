# conference-radar worker (QNFO.OPS.008, re-delivered 2026-09-01)

Weekly cron scan (0 5 * * 1 UTC) of verified QNFO-relevant venue event pages.
Parallel scan of 12 venues (per-venue 8s AbortController timeout; one venue down never
kills the scan), extracts dated event entries (heuristic regex), compiles a markdown radar
report, persists to D1 qnfo-audit.conference_radar (dedup on slug via INSERT OR REPLACE).

Endpoints:
- GET /           -> latest report (markdown)
- GET /?run=1     -> trigger scan now (JSON result)
- scheduled()     -> weekly cron trigger

Phase 2 (recorded in handoff): obsidian-writer (R2 vault) delivery + qnfo-email delivery +
Cloudflare Workflows upgrade (durable step.do per venue, waitForEvent outreach gate).

Note: first delivery attempt was REFUTED by the post-publication red-team audit
(no worker, no cron, no commit, empty table). Re-delivered with verified evidence:
mkdir-first, node --check, inlined-source deploy (ESM sandbox - no require/fs),
D1 binding RADAR_DB in upload metadata, cron read-back, smoke test 200, D1 row read-back.
