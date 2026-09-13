// FLEET registry snapshot for qnfo-observability
//
// REGENERATED 2026-09-13 from qnfo-audit.service_registry (55 rows), cross-checked against
// qnfo-fleet-dashboard's own Cloudflare API read:
//   fleet_dashboard_state.fleet.workers      = 55
//   fleet_dashboard_state.integration.ghost  = []
//   fleet_dashboard_state.integration.unregistered = []
//   (updated 2026-09-13T13:46:11.904Z, from /accounts/{id}/workers/scripts?per_page=100)
//
// PRIOR VERSION: captured 2026-09-10 with 81 entries, one of which ("qnfo-scorecard") was appended
// by hand on the same day. Those 81 names were live on 2026-09-10; the fleet then underwent a
// ghost-retirement reconciliation on 2026-09-12 (see qnfo-fleet-dashboard/registry.js: "dropped 25
// ghost scheduled entries, 39 ghost probes, 2 fully-ghost chains"). This file was not regenerated.
//
// CONSEQUENCE OF THE STALE LIST — both consumers were wrong, permanently:
//   digest()    workers_silent_24h = FLEET.filter(w => !seen.has(w))
//               reported ~26 workers as silent that no longer exist.
//   logEvent()  registered: KNOWN.has(w)
//               mislabelled retired names as registered.
//
// MAINTENANCE: regenerate from service_registry. Do not hand-append. A worker that has been merged
// into a hub is retired even if its code still runs inside the hub under its own WORKER constant
// (cf. qnfo-fleet-control bundling qnfo-fleet-advisor + qnfo-fleet-calibrator).

export const FLEET = [
  "ai-health-prober",
  "audit-hub",
  "calendar-api",
  "companion-hub",
  "errata-hub",
  "fleet-exec",
  "idea-hub",
  "jnl-pipeline",
  "obsidian-writer",
  "osf-integrity-check",
  "personal-api",
  "personal-companion",
  "qnfo-agent-orchestrator",
  "qnfo-agent-ws",
  "qnfo-ai",
  "qnfo-ai-calibration",
  "qnfo-ai-search",
  "qnfo-archive",
  "qnfo-autopilot",
  "qnfo-backlog-exec",
  "qnfo-chat-canary",
  "qnfo-cloud-ops",
  "qnfo-ddocs-indexer",
  "qnfo-email",
  "qnfo-email-orchestrator",
  "qnfo-events",
  "qnfo-fleet-control",
  "qnfo-fleet-dashboard",
  "qnfo-gateway",
  "qnfo-impact",
  "qnfo-infra",
  "qnfo-intent-orchestrator",
  "qnfo-ipatent",
  "qnfo-kaizen",
  "qnfo-lifecycle",
  "qnfo-memory-mcp",
  "qnfo-observability",
  "qnfo-ops",
  "qnfo-outreach",
  "qnfo-paper-explainer",
  "qnfo-paper-indexer",
  "qnfo-paper-reviser",
  "qnfo-pdf",
  "qnfo-proof",
  "qnfo-qwav",
  "qnfo-research-exec",
  "qnfo-research-supervisor",
  "qnfo-signal-loop",
  "qnfo-skill-sync",
  "qnfo-social",
  "qnfo-subscribers",
  "qnfo-tools-mcp",
  "qnfo-twin-maintain",
  "radar-hub",
  "research-daily-brief"
];
