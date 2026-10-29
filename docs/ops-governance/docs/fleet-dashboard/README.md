# QNFO Fleet Operations Dashboard

LIVE dashboard: **https://fleet.qnfo.org/**  (worker qnfo-fleet-dashboard v1.0.0, zone route fleet.qnfo.org/*, D1 bindings AUDIT/LIVING/OUTREACH + CF_TOKEN)
Footer link on the QNFO website (qnfo.org, qnfo-gateway): small-print "Fleet status" -> https://fleet.qnfo.org/

At a glance (auto-refresh 90s; raw JSON: /api/state, refresh: /api/refresh, liveness: /health):
- 72 workers / 48 scheduled / 9 D1 / 10 health probes
- 24h request + error totals (GraphQL), per-scheduled-worker errors, next runs, audits (errata / AI gateway failures / ops_ai_log / model health / outreach pipeline + sent_log / task_dod_register / scheduler_state), device-bound rows (Windows tasks + DeepChat local cron, registry-captured).
- Known gaps: (1) no per-worker run-success ledger yet (fleet_error_state captures only errors); (2) REGISTRY.health_probes still target q08.workers.dev URLs which return 404 -> dashboard reports probes down that are actually unrouted-publicly; repoint to routed qnfo.org hostnames. See register rows.

Sources: CF Workers API registry (REGISTRY in worker), qnfo-audit / living-paper / qnfo-outreach D1, Cloudflare GraphQL, Windows Task Scheduler + DeepChat local cron registry captured at deploy time.
