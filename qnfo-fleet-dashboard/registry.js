// qnfo-fleet-dashboard registry - regenerated from the DEPLOYED worker (registry v4, captured 2026-09-12T10:00:00Z)
// REGISTRY-LAG-PARITY-1: the repo previously held a stale v3/2026-09-10 snapshot; this syncs the file to the live deployed registry.
export const REGISTRY = {
  "version": 4,
  "captured_at": "2026-09-12T10:00:00Z",
  "note": "Regenerated 2026-09-12 (fleet-consolidation cleanup): scheduled + health_probes rebuilt from live CF scripts (54 workers, 40 cron), dropped deleted/consolidated workers, chain stages repointed to live workers, worker /health probing moved to CF-API liveness (workers.dev subrequest is broken from within a Worker). v2 (1.3.0): self HTTP probe replaced by an internal self-assert (a Worker cannot reliably fetch its own custom domain - it returns 522); domain probes carry kind=domain and no longer emit a script-missing label (hostnames are not script ids); probe issues require 2+ failures in 30m (anti-transient).",
  "scheduled": [
    {
      "name": "ai-health-prober",
      "crons": [
        "15 * * * *"
      ],
      "purpose": "AI health prober loop",
      "group": "fleet-ai"
    },
    {
      "name": "audit-hub",
      "crons": [
        "23 6 * * 1",
        "30 4 * * *",
        "40 4 * * *",
        "45 1,13 * * *"
      ],
      "purpose": "Audit hub (auditor + blank-audit merged)",
      "group": "fleet-ops"
    },
    {
      "name": "calendar-api",
      "crons": [
        "17 * * * *"
      ],
      "purpose": "Calendar/email intent sync",
      "group": "intent-email"
    },
    {
      "name": "companion-hub",
      "crons": [
        "0 */12 * * *",
        "0 2 * * *",
        "0 6 * * *"
      ],
      "purpose": "Personal companion hub",
      "group": "personal"
    },
    {
      "name": "fleet-exec",
      "crons": [
        "* * * * *"
      ],
      "purpose": "Dynamic execution layer dispatcher",
      "group": "fleet"
    },
    {
      "name": "idea-hub",
      "crons": [
        "0 * * * *",
        "*/10 * * * *"
      ],
      "purpose": "Idea hub (miner + triage merged)",
      "group": "engagement"
    },
    {
      "name": "jnl-pipeline",
      "crons": [
        "*/10 * * * *",
        "23 */2 * * *"
      ],
      "purpose": "Journal pipeline (watch + referee merged)",
      "group": "research-publish"
    },
    {
      "name": "osf-integrity-check",
      "crons": [
        "0 9 1 * *"
      ],
      "purpose": "OSF integrity sweep",
      "group": "research-publish"
    },
    {
      "name": "personal-api",
      "crons": [
        "5 5 * * *"
      ],
      "purpose": "Personal twin API maintenance",
      "group": "personal"
    },
    {
      "name": "personal-companion",
      "crons": [
        "0 6 * * *"
      ],
      "purpose": "Personal companion loop",
      "group": "personal"
    },
    {
      "name": "qnfo-ai",
      "crons": [
        "23 3 * * *"
      ],
      "purpose": "AI gateway maintenance",
      "group": "fleet-ai"
    },
    {
      "name": "qnfo-ai-calibration",
      "crons": [
        "*/30 * * * *"
      ],
      "purpose": "AI model calibration probes",
      "group": "fleet-ai"
    },
    {
      "name": "qnfo-archive",
      "crons": [
        "0 4 * * *"
      ],
      "purpose": "Archive sweep",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-autopilot",
      "crons": [
        "5 * * * *"
      ],
      "purpose": "Autopilot closed-loop driver",
      "group": "fleet"
    },
    {
      "name": "qnfo-backlog-exec",
      "crons": [
        "10 1 * * *"
      ],
      "purpose": "Deferred backlog executor",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-chat-canary",
      "crons": [
        "15 */3 * * *",
        "19 6 * * *"
      ],
      "purpose": "Chat canary probes",
      "group": "fleet-ai"
    },
    {
      "name": "qnfo-cloud-ops",
      "crons": [
        "0 15 * * 5",
        "0 4 1 * *",
        "0 4 * * 7",
        "0 5 * * 1",
        "0 6,12 * * 1-5",
        "0 7,13 * * 1-5",
        "0 7 * * 7",
        "0 8 * * 1-5",
        "0 9 * * 1-5",
        "0 9 3 9 *",
        "10 3 * * *",
        "11 6 * * 1",
        "13 6 * * 6",
        "15 4 * * *",
        "15 5 * * 1",
        "20 4 * * *",
        "30 3 * * 1",
        "30 5 * * 1",
        "30 6 * * 1-5",
        "30 7 * * 1-5",
        "5 3,15 * * *"
      ],
      "purpose": "Cloud ops weekly digests + lifecycle",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-ddocs-indexer",
      "crons": [
        "37 */2 * * *"
      ],
      "purpose": "Deep-docs indexer",
      "group": "research-publish"
    },
    {
      "name": "qnfo-email-orchestrator",
      "crons": [
        "0 */3 * * *"
      ],
      "purpose": "Email intent orchestration",
      "group": "intent-email"
    },
    {
      "name": "qnfo-events",
      "crons": [
        "15 */6 * * *"
      ],
      "purpose": "Events processing",
      "group": "engagement"
    },
    {
      "name": "qnfo-fleet-control",
      "crons": [
        "0 * * * *",
        "0 3 * * *",
        "0 4 1 * *",
        "*/20 * * * *",
        "30 3 * * 1"
      ],
      "purpose": "Fleet control plane (advisor+calibrator+deploy merged)",
      "group": "fleet"
    },
    {
      "name": "qnfo-fleet-dashboard",
      "crons": [
        "*/15 * * * *"
      ],
      "purpose": "Fleet dashboard refresh",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-impact",
      "crons": [
        "0 4 * * *"
      ],
      "purpose": "Impact metrics",
      "group": "engagement"
    },
    {
      "name": "qnfo-infra",
      "crons": [
        "0 18 * * *",
        "21 6 * * *"
      ],
      "purpose": "Infra state snapshots",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-intent-orchestrator",
      "crons": [
        "0 6 * * *",
        "30 6 * * *"
      ],
      "purpose": "Intent digest/routing",
      "group": "intent-email"
    },
    {
      "name": "qnfo-kaizen",
      "crons": [
        "0 10 * * 1",
        "0 2 * * *"
      ],
      "purpose": "Kaizen watchtower + meta loop",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-lifecycle",
      "crons": [
        "0 * * * *",
        "0 0 1 * *",
        "0 3 * * *",
        "0 4 * * *",
        "0 5 * * *",
        "0 7 * * *",
        "0 8 * * 1",
        "*/30 * * * *",
        "9 6 * * *"
      ],
      "purpose": "Lifecycle scheduled ops",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-observability",
      "crons": [
        "*/15 * * * *",
        "15 6 * * *",
        "17 * * * *"
      ],
      "purpose": "Observability telemetry",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-ops",
      "crons": [
        "*/30 * * * *"
      ],
      "purpose": "Ops AI gateway health loop",
      "group": "fleet-ai"
    },
    {
      "name": "qnfo-outreach",
      "crons": [
        "0 11 * * 1-5"
      ],
      "purpose": "Outreach campaign engine",
      "group": "engagement"
    },
    {
      "name": "qnfo-paper-explainer",
      "crons": [
        "0 14 * * *"
      ],
      "purpose": "Paper explainer generation",
      "group": "research-publish"
    },
    {
      "name": "qnfo-paper-indexer",
      "crons": [
        "5 6 * * *"
      ],
      "purpose": "Paper indexer",
      "group": "research-publish"
    },
    {
      "name": "qnfo-paper-reviser",
      "crons": [
        "37 */4 * * *"
      ],
      "purpose": "Publication reviser loop",
      "group": "research-publish"
    },
    {
      "name": "qnfo-research-exec",
      "crons": [
        "*/10 * * * *"
      ],
      "purpose": "Research version_queue drain",
      "group": "research-publish"
    },
    {
      "name": "qnfo-signal-loop",
      "crons": [
        "0 * * * *"
      ],
      "purpose": "Signal loop processor",
      "group": "fleet"
    },
    {
      "name": "qnfo-skill-sync",
      "crons": [
        "0 3 * * *"
      ],
      "purpose": "Skill sync",
      "group": "fleet-ops"
    },
    {
      "name": "qnfo-social",
      "crons": [
        "0 6 * * *",
        "30 14 * * *"
      ],
      "purpose": "Social amplifier queue",
      "group": "engagement"
    },
    {
      "name": "qnfo-twin-maintain",
      "crons": [
        "0 4 * * *"
      ],
      "purpose": "Personal twin maintain",
      "group": "personal"
    },
    {
      "name": "radar-hub",
      "crons": [
        "0 11 1,15 * *",
        "0 5 * * 1",
        "0 6 1 * *",
        "0 7 * * 2",
        "0 8 * * 7",
        "0 9 * * 7",
        "30 5 * * 2",
        "30 8 * * *"
      ],
      "purpose": "Radar hub (arxiv+events+research+citation merged)",
      "group": "research-publish"
    },
    {
      "name": "research-daily-brief",
      "crons": [
        "7 6 * * *"
      ],
      "purpose": "Daily research brief send",
      "group": "research-publish"
    }
  ],
  "chains": [
    {
      "name": "research-intake",
      "label": "Research intake (radar -> ideas -> triage)",
      "stages": [
        "radar-hub",
        "idea-hub"
      ],
      "checks": [
        {
          "label": "untriaged proposals",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM idea_proposals WHERE status='new'",
          "max": 10
        },
        {
          "label": "accepted fuel",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM idea_proposals WHERE status IN ('triaged_accepted','ensemble-registered')",
          "min": 1
        }
      ]
    },
    {
      "name": "research-exec",
      "label": "Research execution (queue -> papers)",
      "stages": [
        "qnfo-research-exec"
      ],
      "checks": [
        {
          "label": "queue depth",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM research_queue WHERE status IN ('pending','ensemble-draft','claimed')",
          "max": 10
        },
        {
          "label": "published 7d",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM research_queue WHERE status='published' AND completed_at > datetime('now','-7 days')",
          "min": 1
        }
      ]
    },
    {
      "name": "publish",
      "label": "Publication (reviser -> versions -> Zenodo)",
      "stages": [
        "qnfo-paper-reviser",
        "qnfo-research-exec"
      ],
      "checks": [
        {
          "label": "drafted backlog",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM version_queue WHERE status='drafted'",
          "max": 10
        },
        {
          "label": "versions published 7d",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM version_queue WHERE status='published' AND updated_at > datetime('now','-7 days')",
          "min": 1
        }
      ]
    },
    {
      "name": "knowledge-graph",
      "label": "Knowledge graph (papers -> nodes)",
      "stages": [
        "qnfo-paper-indexer",
        "qnfo-memory-mcp"
      ],
      "checks": [
        {
          "label": "KG nodes",
          "store": "GRAPH",
          "sql": "SELECT COUNT(*) AS n FROM nodes",
          "min": 5e3
        },
        {
          "label": "papers (living)",
          "store": "LIVING",
          "sql": "SELECT COUNT(*) AS n FROM papers",
          "min": 500
        }
      ]
    },
    {
      "name": "intent-loop",
      "label": "Intent orchestration (email/calendar -> intents)",
      "stages": [
        "qnfo-email-orchestrator",
        "calendar-api",
        "qnfo-intent-orchestrator"
      ],
      "checks": [
        {
          "label": "pending intents",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM intents WHERE status='pending'",
          "max": 10
        }
      ]
    },
    {
      "name": "engagement",
      "label": "Engagement (outreach + social)",
      "stages": [
        "qnfo-outreach",
        "qnfo-social"
      ],
      "checks": [
        {
          "label": "outreach queue",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM outreach_queue WHERE status IN ('pending','needs-contact')",
          "max": 50
        },
        {
          "label": "threads queued",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM social_threads WHERE status='queued'",
          "max": 30
        },
        {
          "label": "threads posted 7d",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM social_threads WHERE posted_at > datetime('now','-7 days')",
          "min": 1
        }
      ]
    },
    {
      "name": "governance",
      "label": "Governance (register -> kaizen disposition)",
      "stages": [
        "qnfo-kaizen",
        "qnfo-cloud-ops"
      ],
      "checks": [
        {
          "label": "user-waiting rows",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM task_dod_register WHERE owner='user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')",
          "max": 0
        },
        {
          "label": "proposed candidates",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM kaizen_candidates WHERE status='proposed'",
          "max": 3
        }
      ]
    },
    {
      "name": "fleet-exec",
      "label": "Dynamic execution layer",
      "stages": [
        "fleet-exec",
        "qnfo-fleet-control"
      ],
      "checks": [
        {
          "label": "runs 24h",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM fleet_runs WHERE started_at > datetime('now','-1 day')",
          "min": 1
        },
        {
          "label": "rejected artifacts 7d",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM codeparse_events WHERE status='rejected' AND ts > datetime('now','-7 days')",
          "max": 0
        }
      ]
    },
    {
      "name": "telemetry",
      "label": "Telemetry (trace -> worker_logs)",
      "stages": [
        "qnfo-observability"
      ],
      "checks": [
        {
          "label": "trace rows 24h",
          "store": "AUDIT",
          "sql": "SELECT COUNT(*) AS n FROM worker_logs WHERE ts_ms > (strftime('%s','now') - 86400) * 1000",
          "min": 1
        }
      ]
    }
  ],
  "windows_tasks": [
    {
      "name": "QNFO-ModelKey-Guard",
      "status": "Ready",
      "last": "9/7/2026 7:25:01 PM",
      "lastres": "0",
      "next": "9/7/2026 7:55:00 PM",
      "schedule": "Minute (every 30)"
    },
    {
      "name": "QNFO-DeepChat-Backup",
      "status": "Ready",
      "last": "9/7/2026 9:19:54 AM",
      "lastres": "-2147020576",
      "next": "9/8/2026 6:45:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO-AgentDB-Daily-Backup",
      "status": "Ready",
      "last": "9/6/2026 9:30:01 PM",
      "lastres": "0",
      "next": "9/7/2026 9:30:00 PM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_DeepChat_Backup_Daily",
      "status": "Ready",
      "last": "9/7/2026 3:54:46 PM",
      "lastres": "-2147020576",
      "next": "9/8/2026 9:30:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_Snapshot_Purge",
      "status": "Ready",
      "last": "9/7/2026 4:34:52 AM",
      "lastres": "-2147020576",
      "next": "9/8/2026 3:00:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_Skill_Pull_Daily",
      "status": "Ready",
      "last": "9/7/2026 9:19:54 AM",
      "lastres": "-2147020576",
      "next": "9/8/2026 6:30:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_Chat_Log_Push",
      "status": "Ready",
      "last": "9/7/2026 9:19:54 AM",
      "lastres": "-2147020576",
      "next": "9/8/2026 5:25:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_Tape_Prune_Daily",
      "status": "Ready",
      "last": "9/7/2026 9:19:54 AM",
      "lastres": "-2147020576",
      "next": "9/8/2026 5:35:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_FS_Maintenance_Daily",
      "status": "Ready",
      "last": "9/7/2026 3:54:46 PM",
      "lastres": "1",
      "next": "9/8/2026 9:40:00 AM",
      "schedule": "Daily"
    },
    {
      "name": "QNFO_DeepChat_Reload",
      "status": "Ready",
      "last": "9/7/2026 7:36:01 PM",
      "lastres": "0",
      "next": "9/7/2026 7:46:00 PM",
      "schedule": "Minute (every 10)"
    },
    {
      "name": "QNFO_Obsidian_Sync",
      "status": "Ready",
      "last": "9/7/2026 7:38:01 PM",
      "lastres": "3",
      "next": "9/7/2026 7:53:00 PM",
      "schedule": "Minute (every 15)"
    },
    {
      "name": "QNFO_Obsidian_Cloud_Bridge",
      "status": "Disabled",
      "last": "11/30/1999",
      "lastres": "267011",
      "next": "N/A",
      "schedule": "Daily"
    }
  ],
  "local_crons": [
    {
      "id": "aa67d355",
      "name": "QNFO Data Freshness Sync (calendar/email to orchestrator)",
      "cron": "12 5 * * *",
      "note": "canonical row 1"
    },
    {
      "id": "42b1988c",
      "name": "Fleet Drift and Self-Improvement Audit",
      "cron": "30 5 * * 1",
      "note": "canonical row 2"
    },
    {
      "id": "c7f96688",
      "name": "Local config/credential guard",
      "cron": "device-triggered",
      "note": "canonical row 3"
    },
    {
      "id": "2055e49c",
      "name": "Device-bound maintenance one-shot",
      "cron": "one-shot",
      "note": "canonical row 4"
    },
    {
      "id": "6e91c844",
      "name": "Front-end local cron mirror guard",
      "cron": "device-triggered",
      "note": "canonical row 5"
    }
  ],
  "health_probes": [
    { "name": "qnfo.org", "url": "https://qnfo.org/", "label": "QNFO public site", "kind": "domain" },
    { "name": "papers.qnfo.org", "url": "https://papers.qnfo.org/", "label": "QNFO papers site", "kind": "domain" },
    { "name": "qnfo-fleet-dashboard", "self": true, "label": "Fleet dashboard (self)", "kind": "self" },
    { "name": "qnfo-ops", "binding": "SVC_QNFO_OPS", "kind": "worker" },
    { "name": "qnfo-ai", "binding": "SVC_QNFO_AI", "kind": "worker" },
    { "name": "qnfo-kaizen", "binding": "SVC_QNFO_KAIZEN", "kind": "worker" },
    { "name": "qnfo-outreach", "binding": "SVC_QNFO_OUTREACH", "kind": "worker" },
    { "name": "qnfo-paper-reviser", "binding": "SVC_QNFO_PAPER_REVISER", "kind": "worker" },
    { "name": "qnfo-social", "binding": "SVC_QNFO_SOCIAL", "kind": "worker" },
    { "name": "personal-api", "binding": "SVC_PERSONAL_API", "kind": "worker" }
  ]
};
